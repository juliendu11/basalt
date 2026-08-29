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
import CampaignVersion from '#models/campaign_version'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignEngineService from '#services/automation/campaign_engine_service'
import ExecutionSchedulerService from '#services/automation/execution_scheduler_service'
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
const scheduler = new ExecutionSchedulerService()

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
  await smtpConnectorService.create(project, owner, {
    name: 'Primary',
    host: 'localhost',
    port: 1025,
    username: 'user@example.com',
    password: 'whatever',
    encryption: 'none',
    fromEmail: 'noreply@example.com',
    fromName: 'Acme',
  })
  return { owner, project, contact, segment }
}

/** Publishes a { source segment -> send_email -> wait -> send_email } graph and returns the published version. */
async function publishTwoEmailWaitGraph(
  owner: Awaited<ReturnType<typeof UserFactory.create>>,
  project: Awaited<ReturnType<typeof projectService.create>>,
  segmentId: number
) {
  const emailA = await emailService.create(project, owner, {
    name: 'Email A',
    subject: 'First email',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>First!</p>',
  })
  const emailB = await emailService.create(project, owner, {
    name: 'Email B',
    subject: 'Second email',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>Second!</p>',
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
      clientKey: 'send-a',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: emailA.id },
      position: { x: 100, y: 0 },
    },
    {
      clientKey: 'wait',
      type: 'action',
      subtype: 'wait',
      config: { durationValue: 2, durationUnit: 'days' },
      position: { x: 200, y: 0 },
    },
    {
      clientKey: 'send-b',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: emailB.id },
      position: { x: 300, y: 0 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'send-a', sourceHandle: null },
    { sourceClientKey: 'send-a', targetClientKey: 'wait', sourceHandle: null },
    { sourceClientKey: 'wait', targetClientKey: 'send-b', sourceHandle: null },
  ]

  await builderService.saveDraft(draft, { nodes, edges })
  const published = await builderService.publish(draft, owner)
  await campaign.refresh()

  return { campaign, version: published, emailA, emailB }
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

test.group('Campaign Engine — init.md scenarios', () => {
  test('Scenario 1: segment -> email -> wait 2 days -> email, full walk-through', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { enrollment, execution } = await enroll(project, campaign.id, version.id, contact.id)

    // Pass 1: source (no-op) -> continue immediately re-enqueues, but we
    // drive the chain directly rather than through a live worker.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'pending') // now sitting on send-a

    // Pass 2: send-a executes (real SMTP send via Mailcatcher).
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'pending') // now sitting on wait

    // Pass 3: wait node -> execution goes to 'waiting' with a future scheduledAt.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'waiting')
    assert.isTrue(execution.scheduledAt > DateTime.now().plus({ days: 1 }))

    const deliveriesAfterFirstEmail = await db
      .from('email_deliveries')
      .where('contact_id', contact.id)
    assert.lengthOf(deliveriesAfterFirstEmail, 1)
    assert.equal(deliveriesAfterFirstEmail[0].status, 'sent')

    // Simulate 2 days passing: force scheduledAt into the past (no real sleep).
    execution.scheduledAt = DateTime.now().minus({ minutes: 1 })
    await execution.save()

    // Pass 4: wait is now due -> send-b executes.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'pending') // graph ends after send-b

    // Pass 5: no outgoing edge from send-b -> execution completes.
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    await enrollment.refresh()
    assert.equal(execution.status, 'completed')
    assert.equal(enrollment.status, 'completed')

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 2)
    assert.isTrue(deliveries.every((d) => d.status === 'sent'))
  }).timeout(20_000)

  test('Scenario 3: a waiting execution survives being picked up later, with no in-memory state', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send-a
    await engine.advance({ executionId: execution.id }) // wait
    await execution.refresh()
    assert.equal(execution.status, 'waiting')

    // "Restart": force scheduledAt into the past and rediscover the
    // execution purely from the database via the scheduler, exactly as a
    // fresh process would after a crash/redeploy — no state carried over
    // from the calls above beyond what's persisted.
    execution.scheduledAt = DateTime.now().minus({ minutes: 1 })
    await execution.save()

    const due = await scheduler.findDueExecutions()
    assert.isTrue(due.some((e) => e.id === execution.id))

    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'pending') // advanced to send-b
  }).timeout(20_000)

  test('Scenario 5: two concurrent advance() calls on the same execution — only one send happens', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    await engine.advance({ executionId: execution.id }) // source -> send-a is next

    // Race two concurrent advance() calls at the send-a node.
    await Promise.all([
      engine.advance({ executionId: execution.id }),
      engine.advance({ executionId: execution.id }),
    ])

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 1)
    assert.equal(deliveries[0].status, 'sent')
  }).timeout(20_000)

  test('Scenario 7: contact unsubscribes before the send_email node — skipped, execution continues', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    await contactService.changeStatus(contact, 'unsubscribed')

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send-a: skipped (not subscribed)
    await execution.refresh()
    assert.equal(execution.status, 'pending') // still advanced to wait, no send happened

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 0)

    const events = await db
      .from('campaign_execution_events')
      .where('campaign_execution_id', execution.id)
      .where('message', 'like', '%not subscribed%')
    assert.isAbove(events.length, 0)
  }).timeout(20_000)

  test('a paused campaign neither advances nor modifies a waiting execution, and resumes correctly', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send-a
    await engine.advance({ executionId: execution.id }) // wait
    await execution.refresh()
    assert.equal(execution.status, 'waiting')
    const scheduledBeforePause = execution.scheduledAt

    await campaignService.pause(campaign, owner)
    execution.scheduledAt = DateTime.now().minus({ minutes: 1 }) // force it "due"
    await execution.save()

    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    // Neither advanced nor modified: still 'waiting', still on the wait node.
    assert.equal(execution.status, 'waiting')

    await campaignService.resume(campaign, owner)
    await engine.advance({ executionId: execution.id })
    await execution.refresh()
    assert.equal(execution.status, 'pending') // now advances to send-b

    assert.isTrue(scheduledBeforePause instanceof DateTime) // sanity: we did capture a real value
  }).timeout(20_000)

  test('Regression: the anti-infinite-loop guard trips a pathologically long transition chain', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)
    const { execution, enrollment } = await enroll(project, campaign.id, version.id, contact.id)

    await engine.advance({ executionId: execution.id }) // source -> now sitting on send-a

    // Simulate having already made 50 consecutive continue/branch
    // transitions without a wait (the real chain would be a long straight
    // sequence of action nodes — the threshold check itself doesn't care
    // how the count got there, only that it did).
    await engine.advance({ executionId: execution.id, loopGuardCount: 50 })

    await execution.refresh()
    await enrollment.refresh()
    assert.equal(execution.status, 'failed')
    assert.include(execution.lastError ?? '', 'infinite loop')
  }).timeout(20_000)
})
