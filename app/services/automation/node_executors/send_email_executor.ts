import nodemailer from 'nodemailer'
import { DateTime } from 'luxon'
import env from '#start/env'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import CampaignVersion from '#models/campaign_version'
import Campaign from '#models/campaign'
import Project from '#models/project'
import SmtpConnector from '#models/smtp_connector'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import IdempotentOperation from '#services/jobs/idempotent_operation'
import DeliveryTokenService from '#services/tracking/delivery_token_service'
import TrackingContentRewriter from '#services/tracking/tracking_content_rewriter'
import UnsubscribeService from '#services/unsubscribe/unsubscribe_service'
import {
  renderVariables,
  renderTextVariables,
  type VariableContext,
} from '#services/emails/variable_renderer'
import RetryableError from '#exceptions/retryable_error'
import NonRetryableError from '#exceptions/non_retryable_error'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

interface FrozenSendEmailConfig {
  emailId: number
  smtpConnectorId?: number
  subject: string
  htmlContent: string
  textContent: string | null
  senderName: string
  senderEmail: string
  replyTo: string | null
}

const TERMINAL_STATUSES = ['sent', 'delivered', 'failed', 'bounced']
const SEND_TIMEOUT_MS = 15_000

const smtpConnectorService = new SmtpConnectorService()
const idempotentOperation = new IdempotentOperation()
const deliveryTokenService = new DeliveryTokenService()
const trackingContentRewriter = new TrackingContentRewriter()
const unsubscribeService = new UnsubscribeService()

/**
 * The most safety-critical executor in the engine: the one whose side
 * effect (a real SMTP send) can never safely be repeated blindly. Uses the
 * FROZEN `config` copied onto the node at publish time
 * (decisions/ADR-004-campaign-versioning.md) — never re-reads the live
 * `Email` — and `IdempotentOperation` (docs/plans/15-retry-and-idempotency.md,
 * decisions/ADR-005-email-idempotency.md) keyed deterministically on
 * `${execution.id}:${node.id}` so a crashed-and-retried job can never send
 * the same message twice under normal operation.
 */
export default class SendEmailExecutor implements NodeExecutor {
  async execute(
    execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    // Re-checked on EVERY pass through this node, not just at enrollment
    // time (docs/plans/12-campaign-engine.md § Edge cases, init.md Scenario
    // 7) — the contact's eligibility can change between enrollment and this
    // node being reached. Skipping (not erroring) lets the execution
    // continue normally, as if the edge had simply been followed.
    if (contact.status !== 'subscribed') {
      return { outcome: 'continue', note: 'email skipped: contact not subscribed' }
    }

    const config = node.config as unknown as FrozenSendEmailConfig
    const { campaign, project } = await this.#resolveCampaignAndProject(node)

    const idempotencyKey = `${execution.id}:${node.id}`
    const now = DateTime.now().toSQL({ includeOffset: false })

    const connector = await this.#resolveConnector(campaign.projectId, config.smtpConnectorId)

    const reservation = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey,
      insertRow: {
        project_id: campaign.projectId,
        campaign_id: campaign.id,
        campaign_execution_id: execution.id,
        email_id: config.emailId,
        contact_id: contact.id,
        smtp_connector_id: connector?.id ?? null,
        idempotency_key: idempotencyKey,
        status: 'processing',
        attempt_count: 0,
        created_at: now,
        updated_at: now,
      },
      inFlightStatus: 'processing',
      terminalStatuses: TERMINAL_STATUSES,
      // `ExecutionLockService` already guarantees at most one worker is
      // ever processing a given `campaign_execution` at a time (Scenario 5
      // — no advance() call reaches a node executor without first holding
      // that lock), so by the time we're here, any non-terminal reservation
      // under this SAME execution+node idempotency key can only be this
      // execution's own earlier, now-abandoned attempt — never a genuinely
      // concurrent stranger. `IdempotentOperation`'s generic
      // fresh-in-flight-means-someone-else-has-it staleness window (default
      // 5 minutes) is the wrong guard here: it would silently no-op most
      // real BullMQ retries (30s/2min backoff, both under 5 minutes),
      // meaning a retryable SMTP failure could go unretried in practice.
      // 0 minutes = always resume immediately, since the execution lock is
      // what actually prevents a double-send, not this staleness window.
      stalenessMinutes: 0,
    })

    if (reservation.action === 'skip') {
      // 'terminal': a genuine duplicate call (retry after a successful
      // commit) — the email was already handled, no-op success.
      // 'in_flight': architecturally shouldn't happen for the SAME
      // execution+node under normal operation (ExecutionLockService already
      // ensures only one worker advances a given execution at a time), but
      // if it ever does, the safe choice is to not race a second send —
      // treat it the same as already-handled rather than attempting our own
      // send on top of an attempt already in flight.
      return {
        outcome: 'continue',
        note:
          reservation.reason === 'terminal'
            ? 'email send already completed (idempotent no-op)'
            : 'email send already in flight on another attempt (skipped)',
      }
    }

    if (!connector) {
      await idempotentOperation.complete('email_deliveries', reservation.rowId, 'processing', {
        status: 'failed',
        last_error: 'No SMTP connector available for this project (none configured or enabled).',
      })
      throw new NonRetryableError('No SMTP connector available to send this email.')
    }

    try {
      const info = await this.#send(connector, config, contact, project, reservation.rowId)

      await idempotentOperation.complete('email_deliveries', reservation.rowId, 'processing', {
        status: 'sent',
        sent_at: DateTime.now().toSQL({ includeOffset: false }),
        provider_message_id: info.messageId ?? null,
      })

      return { outcome: 'continue' }
    } catch (error) {
      const classified = classifySmtpError(error)

      if (classified instanceof NonRetryableError) {
        await idempotentOperation.complete('email_deliveries', reservation.rowId, 'processing', {
          status: 'failed',
          last_error: classified.message,
        })
      }
      // Retryable: leave the row in `processing` — a subsequent retry
      // resumes this same reservation (once stale) rather than creating a
      // new one, per IdempotentOperation's design.

      throw classified
    }
  }

  async #send(
    connector: SmtpConnector,
    config: FrozenSendEmailConfig,
    contact: Contact,
    project: Project,
    deliveryId: number
  ): Promise<{ messageId?: string }> {
    const decrypted = smtpConnectorService.decryptedConfig(connector)

    const transport = nodemailer.createTransport({
      host: decrypted.host,
      port: decrypted.port,
      secure: decrypted.encryption === 'ssl',
      requireTLS: decrypted.encryption === 'tls',
      auth: { user: decrypted.username, pass: decrypted.password },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    })

    // `{{ contact.firstname }}`/`{{ project.name }}`/`{{ unsubscribe_url }}`
    // (docs/plans/08-email-templates.md § Domain concepts) are rendered
    // against the FROZEN subject/htmlContent/textContent — never the live
    // `Email` — applied to all three fields, not just the HTML body, since
    // the token syntax is generic text substitution. This must run BEFORE
    // `TrackingContentRewriter` below: `{{ unsubscribe_url }}` typically sits
    // inside an authored `<a href="...">`, and link/pixel rewriting needs to
    // see the real, final URL, not the literal token
    // (docs/plans/17-unsubscribe.md § Backend architecture, Implementation
    // step 10).
    const variableContext: VariableContext = {
      contact: {
        firstname: contact.firstName ?? '',
        lastname: contact.lastName ?? '',
        email: contact.email,
        phone: contact.phone ?? '',
        company: contact.company ?? '',
        country: contact.country ?? '',
        city: contact.city ?? '',
        language: contact.language ?? '',
        timezone: contact.timezone ?? '',
      },
      project: { name: project.name },
      subject: config.subject,
      unsubscribeUrl: await unsubscribeService.urlFor(project, contact),
    }

    // Subject and text are plain text (an SMTP header, a text/plain body) —
    // HTML-escaping them would corrupt a contact field containing `&`, `<`,
    // etc. into literal entities (variable_renderer.ts).
    const renderedSubject = renderTextVariables(config.subject, variableContext)
    const renderedHtml = renderVariables(config.htmlContent, variableContext)
    const renderedText = config.textContent
      ? renderTextVariables(config.textContent, variableContext)
      : null

    // Pixel/link rewriting operates on a LOCAL COPY of the frozen
    // `htmlContent` — the published `node.config` itself, gelé at
    // publication (decisions/ADR-004-campaign-versioning.md), is never
    // mutated (docs/plans/16-email-tracking.md § Domain concepts:
    // `TrackingContentRewriter` "opère sur le HTML déjà figé... pas au
    // moment de la publication"). The token can only be computed once the
    // `email_deliveries` row's own id exists, i.e. after the idempotency
    // reservation succeeded — hence this happening here, in `#send()`, not
    // earlier.
    const deliveryToken = deliveryTokenService.encode(deliveryId)
    const trackedHtml = trackingContentRewriter.rewrite(
      renderedHtml,
      deliveryToken,
      env.get('APP_URL')
    )

    return transport.sendMail({
      from: config.senderName
        ? `"${config.senderName}" <${config.senderEmail}>`
        : config.senderEmail,
      to: contact.email,
      replyTo: config.replyTo ?? undefined,
      subject: renderedSubject,
      html: trackedHtml,
      text: renderedText ?? undefined,
    })
  }

  async #resolveConnector(
    projectId: number,
    smtpConnectorId?: number
  ): Promise<SmtpConnector | null> {
    if (smtpConnectorId) {
      return SmtpConnector.query()
        .where('id', smtpConnectorId)
        .where('projectId', projectId)
        .where('enabled', true)
        .first()
    }

    return SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject({ id: projectId }))
      .withScopes((scopes) => scopes.default())
      .where('enabled', true)
      .first()
  }

  async #resolveCampaignAndProject(
    node: CampaignNode
  ): Promise<{ campaign: Campaign; project: Project }> {
    const version = await CampaignVersion.query().where('id', node.campaignVersionId).firstOrFail()
    const campaign = await Campaign.query().where('id', version.campaignId).firstOrFail()
    const project = await Project.query().where('id', campaign.projectId).firstOrFail()
    return { campaign, project }
  }
}

/**
 * Classifies a Nodemailer/SMTP send failure per docs/plans/15-retry-and-idempotency.md
 * § Domain concepts: a permanent rejection (5xx, bad credentials) is
 * non-retryable; a transient/network/4xx failure is retryable; anything
 * ambiguous defaults to retryable (an email retried a bit late is
 * preferable to one never sent — the idempotency reservation is what
 * prevents a retry from becoming a duplicate).
 */
export function classifySmtpError(error: unknown): RetryableError | NonRetryableError {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code
  const responseCode = (error as { responseCode?: number })?.responseCode

  if (code === 'EAUTH') return new NonRetryableError(`SMTP authentication failed: ${message}`)
  if (responseCode !== undefined && responseCode >= 500) {
    return new NonRetryableError(
      `SMTP permanently rejected the message (${responseCode}): ${message}`
    )
  }

  return new RetryableError(message)
}
