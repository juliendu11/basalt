import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import EmailService from '#services/emails/email_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import type SmtpConnector from '#models/smtp_connector'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignEngineService from '#services/automation/campaign_engine_service'
import RetryableError from '#exceptions/retryable_error'
import NonRetryableError from '#exceptions/non_retryable_error'
import { classifySmtpError } from '#services/automation/node_executors/send_email_executor'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const emailService = new EmailService()
const smtpConnectorService = new SmtpConnectorService()
const engine = new CampaignEngineService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'a@example.com' })
  const segment = await segmentService.save(project, {
    name: 'Everyone',
    definition: { combinator: 'AND', conditions: [] },
  })
  return { owner, project, contact, segment }
}

/** A minimal { source segment -> send_email } graph, published. */
async function publishSingleEmailGraph(
  owner: Awaited<ReturnType<typeof UserFactory.create>>,
  project: Awaited<ReturnType<typeof projectService.create>>,
  segmentId: number
) {
  const email = await emailService.create(project, owner, {
    name: 'Email A',
    subject: 'Hello',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>Hi!</p>',
  })

  const campaign = await campaignService.create(project, owner, { name: 'Onboarding' })
  const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)

  const nodes: BuilderNode[] = [
    {
      clientKey: 'src',
      type: 'source',
      subtype: 'segment',
      config: { segmentId },
      position: { x: 0, y: 0 },
    },
    {
      clientKey: 'send',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: email.id },
      position: { x: 100, y: 0 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null },
  ]

  await builderService.saveDraft(draft, { nodes, edges })
  const published = await builderService.publish(draft, owner)
  await campaign.refresh()

  const sendNode = await CampaignNode.query()
    .where('campaignVersionId', published.id)
    .where('clientKey', 'send')
    .firstOrFail()

  return { campaign, version: published, email, sendNode }
}

async function enroll(
  project: Awaited<ReturnType<typeof projectService.create>>,
  campaignId: number,
  versionId: number,
  contactId: number
) {
  const enrollment = await CampaignEnrollment.create({
    projectId: project.id,
    campaignId,
    campaignVersionId: versionId,
    contactId,
    status: 'active',
    source: 'test',
    enrolledAt: DateTime.now(),
  })
  const execution = await CampaignExecution.create({
    campaignEnrollmentId: enrollment.id,
    status: 'pending',
    scheduledAt: DateTime.now(),
  })
  return { enrollment, execution }
}

/** An unreachable host/port — every send attempt against it fails with a retryable connection error. */
async function createUnreachableConnector(
  project: Awaited<ReturnType<typeof projectService.create>>,
  owner: Awaited<ReturnType<typeof UserFactory.create>>
) {
  return smtpConnectorService.create(project, owner, {
    name: 'Broken',
    host: '127.0.0.1',
    port: 1, // nothing listens here
    username: 'user@example.com',
    password: 'whatever',
    encryption: 'none',
    fromEmail: 'noreply@example.com',
    fromName: 'Acme',
  })
}

async function pointAtMailcatcher(connector: SmtpConnector) {
  connector.host = 'localhost'
  connector.port = 1025
  await connector.save()
}

test.group('Campaign Engine — retry & idempotency (init.md Scenarios 2 & 6)', () => {
  test('Scenario 2: SMTP failure then retry then success sends exactly one email, resuming the same delivery row', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const connector = await createUnreachableConnector(project, owner)
    const { campaign, version } = await publishSingleEmailGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    // Pass 1: source node (no-op continue).
    await engine.advance({ executionId: execution.id })
    await execution.refresh()

    // Pass 2: send_email against the unreachable connector -> RetryableError,
    // execution stays 'pending' (advance() re-throws for the queue to retry,
    // but re-releases the lock at the SAME state so it can be picked up again).
    await assert.rejects(() => engine.advance({ executionId: execution.id }), RetryableError)
    await execution.refresh()
    assert.equal(execution.status, 'pending')

    const afterFailure = await db
      .from('email_deliveries')
      .where('campaign_execution_id', execution.id)
    assert.lengthOf(afterFailure, 1)
    assert.equal(afterFailure[0].status, 'processing')
    const reservedRowId = afterFailure[0].id

    // "Retry" — fix the connector to point at a real SMTP server (Mailcatcher).
    await pointAtMailcatcher(connector)

    // Pass 3 (the retry): resumes the SAME email_deliveries row, sends for real.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()

    const afterSuccess = await db
      .from('email_deliveries')
      .where('campaign_execution_id', execution.id)
    assert.lengthOf(afterSuccess, 1) // still exactly one row — resumed, not duplicated
    assert.equal(afterSuccess[0].id, reservedRowId)
    assert.equal(afterSuccess[0].status, 'sent')
    assert.isNotNull(afterSuccess[0].sent_at)

    // The graph has no edge out of `send`, so a successful continue
    // completes the execution within that SAME advance() call (no separate
    // pass needed) — verify that already happened.
    assert.equal(execution.status, 'completed')

    const allDeliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(allDeliveries, 1)
  }).timeout(20_000)

  test('Scenario 6 (safe case): a reservation left in-flight by a crashed attempt is resumed, not duplicated', async ({
    assert,
  }) => {
    // Per ADR-005 § Risks, the ONLY residual risk NOT eliminated is a crash
    // strictly AFTER the SMTP accept and AFTER marking `sent` — not
    // reproduced here since the plan itself doesn't guarantee that case.
    // What IS guaranteed: a crash before the send ever happens (the
    // reservation exists in `processing` but nothing was sent) is safely
    // resumable without a duplicate send.
    const { owner, project, contact, segment } = await createFixtures()
    const connector = await smtpConnectorService.create(project, owner, {
      name: 'Primary',
      host: 'localhost',
      port: 1025,
      username: 'user@example.com',
      password: 'whatever',
      encryption: 'none',
      fromEmail: 'noreply@example.com',
      fromName: 'Acme',
    })
    const { campaign, version, sendNode } = await publishSingleEmailGraph(
      owner,
      project,
      segment.id
    )
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    // Pass 1: source node.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()

    // Simulate a prior attempt that reserved the delivery but crashed
    // before ever calling Nodemailer (e.g. process killed right after the
    // reservation insert) — a `processing` row with the SAME deterministic
    // idempotency key the real executor would compute (`${executionId}:${nodeId}`),
    // stale (older than the 5-minute staleness threshold).
    const idempotencyKey = `${execution.id}:${sendNode.id}`
    const staleTimestamp = DateTime.now().minus({ minutes: 10 }).toSQL({ includeOffset: false })
    await db.table('email_deliveries').insert({
      project_id: project.id,
      campaign_id: campaign.id,
      campaign_execution_id: execution.id,
      email_id: null,
      contact_id: contact.id,
      smtp_connector_id: connector.id,
      idempotency_key: idempotencyKey,
      status: 'processing',
      attempt_count: 0,
      created_at: staleTimestamp,
      updated_at: staleTimestamp,
    })

    const before = await db.from('email_deliveries').where('idempotency_key', idempotencyKey)
    assert.lengthOf(before, 1)
    const preExistingRowId = before[0].id

    // Pass 2: send_email resumes the stale reservation instead of inserting
    // a second row, and actually sends (Mailcatcher is reachable).
    await engine.advance({ executionId: execution.id })
    await execution.refresh()

    const after = await db.from('email_deliveries').where('idempotency_key', idempotencyKey)
    assert.lengthOf(after, 1) // resumed the same row, never duplicated
    assert.equal(after[0].id, preExistingRowId)
    assert.equal(after[0].status, 'sent')

    const allDeliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(allDeliveries, 1)
  }).timeout(20_000)

  test('permanently-failed after repeated retryable failures, then a manual retry succeeds without a double-send', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const connector = await createUnreachableConnector(project, owner)
    const { campaign, version } = await publishSingleEmailGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    await engine.advance({ executionId: execution.id }) // source node

    // Simulate BullMQ exhausting its configured `attempts: 4` for the
    // campaign-engine queue (docs/plans/15-retry-and-idempotency.md) by
    // calling advance() 4 times against the broken connector — each one
    // throws RetryableError and increments attemptCount, exactly what the
    // real worker's retry loop would observe.
    for (let i = 0; i < 4; i++) {
      await assert.rejects(() => engine.advance({ executionId: execution.id }), RetryableError)
    }

    await execution.refresh()
    assert.equal(execution.attemptCount, 4)
    assert.equal(execution.status, 'pending') // engine itself never marks 'failed' for a retryable error — that's BullMQ's job at the queue level once attempts are exhausted

    const afterExhaustion = await db
      .from('email_deliveries')
      .where('campaign_execution_id', execution.id)
    assert.lengthOf(afterExhaustion, 1)
    assert.equal(afterExhaustion[0].status, 'processing')

    // Manual retry (per docs/plans/15-retry-and-idempotency.md: re-injects
    // the same job/business key) — fix the connector, advance again.
    await pointAtMailcatcher(connector)
    await engine.advance({ executionId: execution.id })

    const afterManualRetry = await db
      .from('email_deliveries')
      .where('campaign_execution_id', execution.id)
    assert.lengthOf(afterManualRetry, 1) // still one row, no double-send
    assert.equal(afterManualRetry[0].status, 'sent')
  }).timeout(20_000)
})

test.group('classifySmtpError', () => {
  test('EAUTH is non-retryable', ({ assert }) => {
    const result = classifySmtpError({ code: 'EAUTH', message: 'bad creds' })
    assert.instanceOf(result, NonRetryableError)
  })

  test('a 5xx responseCode is non-retryable', ({ assert }) => {
    const result = classifySmtpError({ responseCode: 550, message: 'mailbox unavailable' })
    assert.instanceOf(result, NonRetryableError)
  })

  test('a 4xx responseCode is retryable', ({ assert }) => {
    const result = classifySmtpError({ responseCode: 421, message: 'service not available' })
    assert.instanceOf(result, RetryableError)
  })

  test('a plain network error (ECONNRESET-shaped) is retryable', ({ assert }) => {
    const result = classifySmtpError({ code: 'ECONNRESET', message: 'socket hang up' })
    assert.instanceOf(result, RetryableError)
  })

  test('an unrecognized error shape defaults to retryable (uncertain bias)', ({ assert }) => {
    const result = classifySmtpError(new Error('something weird'))
    assert.instanceOf(result, RetryableError)
  })
})
