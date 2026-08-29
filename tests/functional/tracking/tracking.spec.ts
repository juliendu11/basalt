import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { Worker } from 'bullmq'
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
import EmailDelivery from '#models/email_delivery'
import EmailEvent from '#models/email_event'
import CampaignEngineService from '#services/automation/campaign_engine_service'
import DeliveryTokenService from '#services/tracking/delivery_token_service'
import TrackingEventService from '#services/tracking/tracking_event_service'
import Tag from '#models/tag'
import { queueConnection } from '#config/queue'
import queueRegistry from '#services/jobs/queue_registry'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'
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
const deliveryTokenService = new DeliveryTokenService()
const trackingEventService = new TrackingEventService()

/** Runs one real BullMQ Worker on `tracking` until `count` jobs complete, or times out. */
function waitForTrackingJobsProcessed(count: number, timeoutMs = 8000) {
  let processed = 0
  let resolveAll!: () => void
  const done = new Promise<void>((resolve) => {
    resolveAll = resolve
  })

  const worker = new Worker(
    'tracking',
    async (job) => {
      const handler = jobHandlerRegistry.resolve('tracking', job.name)
      await handler(job.data, job)
      processed += 1
      if (processed >= count) resolveAll()
    },
    {
      connection: queueConnection,
      concurrency: 2,
      settings: { backoffStrategy: queueRegistry.backoffStrategyFor('tracking') },
    }
  )

  const result = Promise.race([
    done,
    new Promise<void>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${count} tracking job(s)`)),
        timeoutMs
      )
    ),
  ])

  return { worker, result }
}

/** A project + contact + a real `email_deliveries` row (sent), for the pixel/click tests. */
async function createDeliveryFixture() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'reader@example.com' })

  const delivery = await EmailDelivery.create({
    projectId: project.id,
    contactId: contact.id,
    idempotencyKey: `test:${contact.id}:${Date.now()}`,
    status: 'sent',
  })

  return { owner, project, contact, delivery }
}

/** A full published { segment -> send_email -> condition(email_opened) -> add_tag/add_tag } graph. */
async function publishEmailOpenedConditionGraph() {
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
  const email = await emailService.create(project, owner, {
    name: 'Email A',
    subject: 'Hello',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>Hi</p>',
  })

  const openedTag = await Tag.create({ projectId: project.id, name: 'opened', color: '#22c55e' })
  const notOpenedTag = await Tag.create({
    projectId: project.id,
    name: 'not-opened',
    color: '#ef4444',
  })

  const campaign = await campaignService.create(project, owner, { name: 'Open check' })
  const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)

  const nodes: BuilderNode[] = [
    {
      clientKey: 'src',
      type: 'source',
      subtype: 'segment',
      config: { segmentId: segment.id },
      position: { x: 0, y: 0 },
    },
    {
      clientKey: 'send',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: email.id },
      position: { x: 100, y: 0 },
    },
    {
      clientKey: 'cond',
      type: 'condition',
      subtype: 'email_opened',
      config: { referenceNodeId: 'send' },
      position: { x: 200, y: 0 },
    },
    {
      clientKey: 'tag-opened',
      type: 'action',
      subtype: 'add_tag',
      config: { tagId: openedTag.id },
      position: { x: 300, y: -50 },
    },
    {
      clientKey: 'tag-not-opened',
      type: 'action',
      subtype: 'add_tag',
      config: { tagId: notOpenedTag.id },
      position: { x: 300, y: 50 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null },
    { sourceClientKey: 'send', targetClientKey: 'cond', sourceHandle: null },
    { sourceClientKey: 'cond', targetClientKey: 'tag-opened', sourceHandle: 'true' },
    { sourceClientKey: 'cond', targetClientKey: 'tag-not-opened', sourceHandle: 'false' },
  ]

  await builderService.saveDraft(draft, { nodes, edges })
  const version = await builderService.publish(draft, owner)
  await campaign.refresh()

  const enrollment = await CampaignEnrollment.create({
    projectId: project.id,
    campaignId: campaign.id,
    campaignVersionId: version.id,
    contactId: contact.id,
    status: 'active',
    source: 'test',
    enrolledAt: DateTime.now(),
  })
  const execution = await CampaignExecution.create({
    campaignEnrollmentId: enrollment.id,
    status: 'pending',
    scheduledAt: DateTime.now(),
  })

  return { project, contact, execution, openedTag, notOpenedTag }
}

test.group('Tracking routes (functional)', () => {
  test('GET /track/open/:token.gif returns a transparent gif and records an opened event', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { delivery } = await createDeliveryFixture()
    const token = deliveryTokenService.encode(delivery.id)

    const { worker, result } = waitForTrackingJobsProcessed(1)
    cleanup(() => worker.close())

    const response = await client.get(`/track/open/${token}.gif`)
    response.assertStatus(200)
    assert.equal(response.response.headers['content-type'], 'image/gif')

    await result

    const events = await EmailEvent.query()
      .where('emailDeliveryId', delivery.id)
      .where('type', 'opened')
    assert.lengthOf(events, 1)
  })

  test('GET /track/open/:token.gif with an unresolvable token still returns 200 with a gif (no info leak)', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/track/open/garbage-token.gif')
    response.assertStatus(200)
    assert.equal(response.response.headers['content-type'], 'image/gif')
  })

  test('GET /track/click/:token redirects to the decoded URL and records a clicked event', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { delivery } = await createDeliveryFixture()
    const token = deliveryTokenService.encode(delivery.id)
    const target = 'https://example.com/landing'

    const { worker, result } = waitForTrackingJobsProcessed(1)
    cleanup(() => worker.close())

    const response = await client.get(`/track/click/${token}`).qs({ u: target }).redirects(0)
    response.assertStatus(302)
    assert.equal(response.response.headers.location, target)

    await result

    const events = await EmailEvent.query()
      .where('emailDeliveryId', delivery.id)
      .where('type', 'clicked')
    assert.lengthOf(events, 1)
  })

  test('an invalid token on click still redirects if a valid u is present (never breaks recipient navigation)', async ({
    client,
  }) => {
    const response = await client
      .get('/track/click/not-a-real-token')
      .qs({ u: 'https://example.com/landing' })
      .redirects(0)
    response.assertStatus(302)
  })

  test('an invalid token with no u returns 404', async ({ client }) => {
    const response = await client.get('/track/click/not-a-real-token').redirects(0)
    response.assertStatus(404)
  })

  test('a javascript: scheme u is never redirected to', async ({ client }) => {
    const response = await client
      .get('/track/click/not-a-real-token')
      .qs({ u: 'javascript:alert(1)' })
      .redirects(0)
    response.assertStatus(404)
  })

  test('POST /webhooks/smtp/:connectorId with a malformed payload responds 200 OK, never an exception', async ({
    client,
  }) => {
    const response = await client
      .post('/webhooks/smtp/1')
      .redirects(0)
      .json({ this: 'is', not: 'a recognized shape' })
    response.assertStatus(200)
  })

  test('POST /webhooks/smtp/:connectorId with garbage array body responds 200 OK', async ({
    client,
  }) => {
    const response = await client.post('/webhooks/smtp/1').redirects(0).json([1, 2, 3])
    response.assertStatus(200)
  })

  test('email_opened condition branches false when no open event was ever processed', async ({
    assert,
  }) => {
    const { execution, contact, openedTag, notOpenedTag } = await publishEmailOpenedConditionGraph()

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send (real send via Mailcatcher)

    const delivery = await EmailDelivery.query()
      .where('campaignExecutionId', execution.id)
      .firstOrFail()
    assert.equal(delivery.status, 'sent')

    await engine.advance({ executionId: execution.id }) // condition -> branches on no event
    await engine.advance({ executionId: execution.id }) // executes the branch target (add_tag)

    const tags = await contact.related('tags').query()
    assert.isTrue(tags.some((t) => t.id === notOpenedTag.id))
    assert.isFalse(tags.some((t) => t.id === openedTag.id))
  })

  test('email_opened condition branches true once an open event has been processed for that delivery', async ({
    assert,
  }) => {
    const { execution, contact, openedTag, notOpenedTag } = await publishEmailOpenedConditionGraph()

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send (real send via Mailcatcher)

    const delivery = await EmailDelivery.query()
      .where('campaignExecutionId', execution.id)
      .firstOrFail()

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'opened' })

    await engine.advance({ executionId: execution.id }) // condition -> branches on the open event
    await engine.advance({ executionId: execution.id }) // executes the branch target (add_tag)

    const tags = await contact.related('tags').query()
    assert.isTrue(tags.some((t) => t.id === openedTag.id))
    assert.isFalse(tags.some((t) => t.id === notOpenedTag.id))
  })
})
