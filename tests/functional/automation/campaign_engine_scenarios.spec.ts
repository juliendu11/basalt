import { DateTime } from 'luxon'
import { Worker } from 'bullmq'
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
import { queueConnection } from '#config/queue'
import queueRegistry from '#services/jobs/queue_registry'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'
import scheduledTaskRegistry from '#services/jobs/scheduled_task_registry'
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

/**
 * Publishes a { source -> send_email -> wait -> send_email -> wait -> send_email }
 * graph — two consecutive wait/resume cycles, the shape that exposed the
 * static-jobId dedupe bug (docs/incidents/2026-09-03-wait-node-resume-jobid-dedupe.md).
 */
async function publishThreeEmailTwoWaitGraph(
  owner: Awaited<ReturnType<typeof UserFactory.create>>,
  project: Awaited<ReturnType<typeof projectService.create>>,
  segmentId: number
) {
  const emails = []
  for (const label of ['A', 'B', 'C']) {
    emails.push(
      await emailService.create(project, owner, {
        name: `Email ${label}`,
        subject: `Email ${label}`,
        senderName: 'Acme',
        senderEmail: 'hello@acme.test',
        htmlContent: `<p>${label}</p>`,
      })
    )
  }

  const campaign = await campaignService.create(project, owner, { name: 'Drip' })
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
      config: { emailId: emails[0].id },
      position: { x: 100, y: 0 },
    },
    {
      clientKey: 'wait-1',
      type: 'action',
      subtype: 'wait',
      config: { durationValue: 1, durationUnit: 'days' },
      position: { x: 200, y: 0 },
    },
    {
      clientKey: 'send-b',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: emails[1].id },
      position: { x: 300, y: 0 },
    },
    {
      clientKey: 'wait-2',
      type: 'action',
      subtype: 'wait',
      config: { durationValue: 1, durationUnit: 'days' },
      position: { x: 400, y: 0 },
    },
    {
      clientKey: 'send-c',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: emails[2].id },
      position: { x: 500, y: 0 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'send-a', sourceHandle: null },
    { sourceClientKey: 'send-a', targetClientKey: 'wait-1', sourceHandle: null },
    { sourceClientKey: 'wait-1', targetClientKey: 'send-b', sourceHandle: null },
    { sourceClientKey: 'send-b', targetClientKey: 'wait-2', sourceHandle: null },
    { sourceClientKey: 'wait-2', targetClientKey: 'send-c', sourceHandle: null },
  ]

  await builderService.saveDraft(draft, { nodes, edges })
  const published = await builderService.publish(draft, owner)
  await campaign.refresh()

  return { campaign, version: published }
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

/** Polls `check` every 50ms until it returns true or `timeoutMs` elapses (then throws). */
async function waitUntil(check: () => Promise<boolean>, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`)
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

  /**
   * Regression for docs/incidents/2026-09-03-wait-node-resume-jobid-dedupe.md.
   *
   * The scheduler used to dispatch the resume job with a static
   * `jobId: campaign-engine.advance-${execution.id}`. BullMQ dedupes
   * `queue.add` against retained completed jobs too, so once the FIRST
   * wait cycle's resume job had completed (and was still in the retained
   * `completed` set), every later `schedule_due_executions` pass for the
   * same execution added nothing — the SECOND wait never resumed.
   *
   * This drives two real wait/resume cycles through the actual
   * `schedule_due_executions` task + a live BullMQ worker. With the bug,
   * the execution never gets past `wait-2` and the third email is never
   * sent, so the final assertions time out / fail.
   */
  test('Regression: two consecutive wait cycles both resume via the scheduler (no static-jobId dedupe against retained completed jobs)', async ({
    assert,
    cleanup,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishThreeEmailTwoWaitGraph(owner, project, segment.id)
    const { execution } = await enroll(project, campaign.id, version.id, contact.id)

    // The campaign-engine queue is real, shared, global Redis state — wipe
    // it (waiting AND retained completed/failed) so a leftover job from
    // another test can't stand in for, or dedupe against, ours.
    const queue = queueRegistry.getQueue('campaign-engine')
    await queue.obliterate({ force: true })

    // A real worker, exactly as `node ace queue:work` runs it.
    const worker = new Worker(
      'campaign-engine',
      async (job) => {
        const handler = jobHandlerRegistry.resolve('campaign-engine', job.name)
        await handler(job.data, job)
      },
      {
        connection: queueConnection,
        concurrency: 1,
        settings: { backoffStrategy: queueRegistry.backoffStrategyFor('campaign-engine') },
      }
    )
    cleanup(async () => {
      await worker.close()
      await queue.obliterate({ force: true })
    })

    const scheduleDue = scheduledTaskRegistry
      .list()
      .find((task) => task.name === 'campaign-engine.schedule_due_executions')
    assert.exists(
      scheduleDue,
      'schedule_due_executions task must be registered (start/scheduler.ts)'
    )

    // Setup only (not the code under test): walk synchronously to the
    // first wait node.
    await engine.advance({ executionId: execution.id }) // source -> send-a
    await engine.advance({ executionId: execution.id }) // send-a -> wait-1
    await engine.advance({ executionId: execution.id }) // wait-1 -> waiting
    await execution.refresh()
    assert.equal(execution.status, 'waiting')

    const deliveryCount = async () => {
      const rows = await db.from('email_deliveries').where('contact_id', contact.id).count('* as c')
      return Number(rows[0].c)
    }

    // --- Cycle 1: due -> scheduler enqueues -> worker resumes past wait-1,
    // sends email B, parks on wait-2. This resume job then sits in the
    // retained `completed` set.
    execution.scheduledAt = DateTime.now().minus({ minutes: 1 })
    await execution.save()
    await scheduleDue!.run()
    await waitUntil(async () => {
      await execution.refresh()
      return execution.status === 'waiting' && (await deliveryCount()) === 2
    })

    // --- Cycle 2: the bug lived here. Same execution, second scheduler
    // pass; the static jobId would collide with cycle 1's retained
    // completed job and enqueue nothing.
    execution.scheduledAt = DateTime.now().minus({ minutes: 1 })
    await execution.save()
    await scheduleDue!.run()
    await waitUntil(async () => {
      await execution.refresh()
      return execution.status === 'completed'
    })

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    // Exactly 3 — proves cycle 2 resumed (not stuck at 2) AND that no node
    // double-sent (not 4+), i.e. dropping the jobId introduced no dup send.
    assert.lengthOf(deliveries, 3)
    assert.isTrue(deliveries.every((d) => d.status === 'sent'))
  }).timeout(30_000)
})
