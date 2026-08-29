import nodemailer from 'nodemailer'
import type Project from '#models/project'
import type Email from '#models/email'
import SmtpConnector from '#models/smtp_connector'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import { composeEmailHtml, composeEmailText } from '#services/emails/email_layout_composer'
import {
  renderVariables,
  renderTextVariables,
  exampleVariableContext,
} from '#services/emails/variable_renderer'

const SEND_TIMEOUT_MS = 15_000

const smtpConnectorService = new SmtpConnectorService()

/** Raised when there's no usable connector to send the test through — never a send/SMTP failure. */
export class NoSmtpConnectorError extends Error {
  constructor() {
    super('No SMTP connector available for this project (none configured or enabled).')
  }
}

/**
 * Sends a one-off test send of an `Email` to an arbitrary address, entirely
 * outside the campaign engine — no `CampaignExecution`, no
 * `email_deliveries` row, no idempotency reservation, no tracking-pixel/link
 * rewriting (docs/plans/16-email-tracking.md's rewriter is deliberately
 * skipped: a test send has no real `Contact`/delivery to attribute opens or
 * clicks to). Composed and rendered the same way as
 * `EmailsController#preview` — the project's live layout frame plus example
 * variable data (no real `Contact` exists to send to) — so what arrives in
 * the inbox matches what the Preview modal already showed.
 */
export default class EmailTestSendService {
  async send(project: Project, email: Email, testEmailAddress: string): Promise<void> {
    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .withScopes((scopes) => scopes.default())
      .where('enabled', true)
      .first()

    if (!connector) throw new NoSmtpConnectorError()

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

    const context = exampleVariableContext(project.name, email.subject)
    const composedHtml = composeEmailHtml(email, email.emailLayout ?? null)
    const composedText = composeEmailText(email, email.emailLayout ?? null)

    const subject = renderTextVariables(email.subject, context)
    const html = renderVariables(composedHtml, context)
    const text = composedText ? renderTextVariables(composedText, context) : undefined

    try {
      await transport.sendMail({
        from: email.senderName ? `"${email.senderName}" <${email.senderEmail}>` : email.senderEmail,
        to: testEmailAddress,
        replyTo: email.replyTo ?? undefined,
        subject: `[Test] ${subject}`,
        html,
        text,
      })
    } finally {
      transport.close()
    }
  }
}
