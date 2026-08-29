import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import CampaignService from '#services/campaigns/campaign_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import EmailService from '#services/emails/email_service'
import Tag from '#models/tag'
import CampaignNode from '#models/campaign_node'
import CampaignVersion from '#models/campaign_version'
import CampaignExecution from '#models/campaign_execution'
import CampaignEnrollment from '#models/campaign_enrollment'
import WaitExecutor from '#services/automation/node_executors/wait_executor'
import AddTagExecutor from '#services/automation/node_executors/add_tag_executor'
import RemoveTagExecutor from '#services/automation/node_executors/remove_tag_executor'
import AddToSegmentExecutor from '#services/automation/node_executors/add_to_segment_executor'
import RemoveFromSegmentExecutor from '#services/automation/node_executors/remove_from_segment_executor'
import ConditionEvaluator from '#services/automation/node_executors/condition_evaluator'
import SendEmailExecutor from '#services/automation/node_executors/send_email_executor'
import type { BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const smtpConnectorService = new SmtpConnectorService()
const emailService = new EmailService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'a@example.com' })
  return { owner, project, contact }
}

/** Builds a real `CampaignNode` row (not just an in-memory config object) — every executor reads `node.config`/`node.campaignVersionId`. */
async function createNode(
  campaignVersionId: number,
  type: BuilderNode['type'],
  subtype: string,
  config: Record<string, unknown>
): Promise<CampaignNode> {
  return CampaignNode.create({
    campaignVersionId,
    clientKey: `n-${Math.random().toString(36).slice(2, 8)}`,
    type,
    subtype,
    config,
    positionX: 0,
    positionY: 0,
  })
}

async function createExecution() {
  const { owner, project, contact } = await createFixtures()
  const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
  const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

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

  return { owner, project, contact, campaign, version, execution }
}

test.group('WaitExecutor', () => {
  test('a plain duration wait resolves a future scheduledAt', async ({ assert }) => {
    const { version, execution, contact } = await createExecution()
    const node = await createNode(version.id, 'action', 'wait', {
      durationValue: 2,
      durationUnit: 'days',
    })

    const result = await new WaitExecutor().execute(execution, node, contact)

    assert.equal(result.outcome, 'wait')
    if (result.outcome === 'wait') {
      const diffDays = result.scheduledAt.diff(DateTime.now(), 'days').days
      assert.isAbove(diffDays, 1.9)
      assert.isBelow(diffDays, 2.1)
    }
  })

  test('waitUntil time_of_day resolves the next occurrence of that time', async ({ assert }) => {
    const { version, execution, contact } = await createExecution()
    const node = await createNode(version.id, 'action', 'wait', {
      durationValue: 0,
      durationUnit: 'minutes',
      waitUntil: { type: 'time_of_day', time: '09:00' },
    })

    const result = await new WaitExecutor().execute(execution, node, contact)

    assert.equal(result.outcome, 'wait')
    if (result.outcome === 'wait') {
      assert.isTrue(result.scheduledAt > DateTime.now())
    }
  })
})

test.group('AddTagExecutor / RemoveTagExecutor', () => {
  test('add_tag attaches the tag idempotently', async ({ assert }) => {
    const { version, execution, contact, project } = await createExecution()
    const tag = await Tag.create({ projectId: project.id, name: 'VIP', color: '#22c55e' })
    const node = await createNode(version.id, 'action', 'add_tag', { tagId: tag.id })

    await new AddTagExecutor().execute(execution, node, contact)
    await new AddTagExecutor().execute(execution, node, contact) // idempotent re-run

    const tags = await contact.related('tags').query()
    assert.lengthOf(tags, 1)
  })

  test('remove_tag detaches the tag idempotently', async ({ assert }) => {
    const { version, execution, contact, project } = await createExecution()
    const tag = await Tag.create({ projectId: project.id, name: 'VIP', color: '#22c55e' })
    await contact.related('tags').sync([tag.id], false)
    const node = await createNode(version.id, 'action', 'remove_tag', { tagId: tag.id })

    await new RemoveTagExecutor().execute(execution, node, contact)
    await new RemoveTagExecutor().execute(execution, node, contact) // idempotent re-run

    const tags = await contact.related('tags').query()
    assert.lengthOf(tags, 0)
  })
})

test.group('AddToSegmentExecutor / RemoveFromSegmentExecutor', () => {
  test('add_to_segment inserts membership idempotently, bypassing recompute', async ({
    assert,
  }) => {
    const { version, execution, contact, project } = await createExecution()
    const segment = await segmentService.save(project, {
      name: 'Manually managed',
      definition: {
        combinator: 'AND',
        conditions: [{ field: 'country', operator: 'equals', value: 'nowhere' }],
      },
    })
    const node = await createNode(version.id, 'action', 'add_to_segment', { segmentId: segment.id })

    await new AddToSegmentExecutor().execute(execution, node, contact)
    await new AddToSegmentExecutor().execute(execution, node, contact)

    const rows = await db
      .from('segment_contacts')
      .where('segment_id', segment.id)
      .where('contact_id', contact.id)
    assert.lengthOf(rows, 1)
  })

  test('remove_from_segment deletes membership idempotently', async ({ assert }) => {
    const { version, execution, contact, project } = await createExecution()
    const segment = await segmentService.save(project, {
      name: 'Manually managed',
      definition: { combinator: 'AND', conditions: [] },
    })
    await db.table('segment_contacts').insert({
      segment_id: segment.id,
      contact_id: contact.id,
      added_at: DateTime.now().toSQL({ includeOffset: false }),
    })
    const node = await createNode(version.id, 'action', 'remove_from_segment', {
      segmentId: segment.id,
    })

    await new RemoveFromSegmentExecutor().execute(execution, node, contact)
    await new RemoveFromSegmentExecutor().execute(execution, node, contact)

    const rows = await db
      .from('segment_contacts')
      .where('segment_id', segment.id)
      .where('contact_id', contact.id)
    assert.lengthOf(rows, 0)
  })
})

test.group('ConditionEvaluator', () => {
  test('contact_field branches true when the condition matches', async ({ assert }) => {
    const { version, execution, contact } = await createExecution()
    contact.country = 'France'
    await contact.save()
    const node = await createNode(version.id, 'condition', 'contact_field', {
      field: 'country',
      operator: 'equals',
      value: 'France',
    })

    const result = await new ConditionEvaluator().execute(execution, node, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'true' })
  })

  test('contact_field branches false when the condition does not match', async ({ assert }) => {
    const { version, execution, contact } = await createExecution()
    contact.country = 'Belgium'
    await contact.save()
    const node = await createNode(version.id, 'condition', 'contact_field', {
      field: 'country',
      operator: 'equals',
      value: 'France',
    })

    const result = await new ConditionEvaluator().execute(execution, node, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'false' })
  })

  test('in_segment branches on direct segment_contacts membership', async ({ assert }) => {
    const { version, execution, contact, project } = await createExecution()
    const segment = await segmentService.save(project, {
      name: 'Manual',
      definition: { combinator: 'AND', conditions: [] },
    })
    await db.table('segment_contacts').insert({
      segment_id: segment.id,
      contact_id: contact.id,
      added_at: DateTime.now().toSQL({ includeOffset: false }),
    })
    const node = await createNode(version.id, 'condition', 'in_segment', { segmentId: segment.id })

    const result = await new ConditionEvaluator().execute(execution, node, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'true' })
  })

  test('in_segment branches false when the contact is genuinely not a member', async ({
    assert,
  }) => {
    // Regression: `.first()` on the raw query builder resolves to `null`
    // (not `undefined`) when nothing matches — a prior `!== undefined`
    // comparison here always evaluated true regardless of actual
    // membership, caught while implementing Phase 12
    // (docs/plans/16-email-tracking.md), see the memory entry for it. The
    // "branches true on real membership" test above never exercised this
    // false path, which is exactly how it went unnoticed.
    const { version, execution, contact, project } = await createExecution()
    const segment = await segmentService.save(project, {
      name: 'Unrelated',
      definition: { combinator: 'AND', conditions: [] },
    })
    // Deliberately no `segment_contacts` row for this contact.
    const node = await createNode(version.id, 'condition', 'in_segment', { segmentId: segment.id })

    const result = await new ConditionEvaluator().execute(execution, node, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'false' })
  })

  test('email_opened/email_clicked branch false when no reference node/delivery/event exists', async ({
    assert,
  }) => {
    const { version, execution, contact } = await createExecution()
    const node = await createNode(version.id, 'condition', 'email_opened', {
      referenceNodeId: 'whatever',
    })

    const result = await new ConditionEvaluator().execute(execution, node, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'false' })
  })

  test('email_opened branches true once an opened event exists for the referenced delivery', async ({
    assert,
  }) => {
    const { version, execution, contact } = await createExecution()
    const sendNode = await createNode(version.id, 'action', 'send_email', { emailId: 1 })
    const conditionNode = await createNode(version.id, 'condition', 'email_opened', {
      referenceNodeId: sendNode.clientKey,
    })

    const idempotencyKey = `${execution.id}:${sendNode.id}`
    const delivery = await db.table('email_deliveries').insert({
      project_id: contact.projectId,
      contact_id: contact.id,
      idempotency_key: idempotencyKey,
      status: 'sent',
      created_at: DateTime.now().toSQL({ includeOffset: false }),
    })
    const deliveryId = Array.isArray(delivery) ? delivery[0] : delivery
    await db.table('email_events').insert({
      project_id: contact.projectId,
      email_delivery_id: deliveryId,
      contact_id: contact.id,
      type: 'opened',
      occurred_at: DateTime.now().toSQL({ includeOffset: false }),
    })

    const result = await new ConditionEvaluator().execute(execution, conditionNode, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'true' })
  })

  test('email_clicked branches false when only an opened (not clicked) event exists', async ({
    assert,
  }) => {
    const { version, execution, contact } = await createExecution()
    const sendNode = await createNode(version.id, 'action', 'send_email', { emailId: 1 })
    const conditionNode = await createNode(version.id, 'condition', 'email_clicked', {
      referenceNodeId: sendNode.clientKey,
    })

    const idempotencyKey = `${execution.id}:${sendNode.id}`
    const delivery = await db.table('email_deliveries').insert({
      project_id: contact.projectId,
      contact_id: contact.id,
      idempotency_key: idempotencyKey,
      status: 'sent',
      created_at: DateTime.now().toSQL({ includeOffset: false }),
    })
    const deliveryId = Array.isArray(delivery) ? delivery[0] : delivery
    await db.table('email_events').insert({
      project_id: contact.projectId,
      email_delivery_id: deliveryId,
      contact_id: contact.id,
      type: 'opened',
      occurred_at: DateTime.now().toSQL({ includeOffset: false }),
    })

    const result = await new ConditionEvaluator().execute(execution, conditionNode, contact)

    assert.deepEqual(result, { outcome: 'branch', handle: 'false' })
  })
})

test.group('SendEmailExecutor', () => {
  test('skips (no send, no error) when the contact is not subscribed', async ({ assert }) => {
    const { version, execution, contact } = await createExecution()
    await contactService.changeStatus(contact, 'unsubscribed')
    const node = await createNode(version.id, 'action', 'send_email', { emailId: 1 })

    const result = await new SendEmailExecutor().execute(execution, node, contact)

    assert.equal(result.outcome, 'continue')
    assert.include(result.note ?? '', 'not subscribed')

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 0)
  })

  test('sends successfully via a real (Mailcatcher) connector and records the delivery', async ({
    assert,
  }) => {
    const { owner, project, version, execution, contact } = await createExecution()
    const email = await emailService.create(project, owner, {
      name: 'Welcome',
      subject: 'Hi there',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent: '<p>Hello!</p>',
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
    const node = await createNode(version.id, 'action', 'send_email', {
      emailId: email.id,
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
    })

    const result = await new SendEmailExecutor().execute(execution, node, contact)

    assert.equal(result.outcome, 'continue')
    const delivery = await db.from('email_deliveries').where('contact_id', contact.id).firstOrFail()
    assert.equal(delivery.status, 'sent')
    assert.isNotNull(delivery.sent_at)
  })

  test('a duplicate execute() call for the same execution+node is a no-op (idempotent)', async ({
    assert,
  }) => {
    const { owner, project, version, execution, contact } = await createExecution()
    const email = await emailService.create(project, owner, {
      name: 'Welcome',
      subject: 'Hi there',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent: '<p>Hello!</p>',
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
    const node = await createNode(version.id, 'action', 'send_email', {
      emailId: email.id,
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
    })

    await new SendEmailExecutor().execute(execution, node, contact)
    await new SendEmailExecutor().execute(execution, node, contact)

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 1)
  })

  test('an unreachable SMTP host raises a RetryableError, leaving the delivery in processing', async ({
    assert,
  }) => {
    const { owner, project, version, execution, contact } = await createExecution()
    const email = await emailService.create(project, owner, {
      name: 'Welcome',
      subject: 'Hi there',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent: '<p>Hello!</p>',
    })
    await smtpConnectorService.create(project, owner, {
      name: 'Unreachable',
      host: '127.0.0.1',
      port: 1,
      username: 'user@example.com',
      password: 'whatever',
      encryption: 'none',
      fromEmail: 'noreply@example.com',
      fromName: 'Acme',
    })
    const node = await createNode(version.id, 'action', 'send_email', {
      emailId: email.id,
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
    })

    await assert.rejects(() => new SendEmailExecutor().execute(execution, node, contact))

    const delivery = await db.from('email_deliveries').where('contact_id', contact.id).firstOrFail()
    assert.equal(delivery.status, 'processing')
  }).timeout(20_000)

  // docs/plans/17-unsubscribe.md § Implementation step 10: proves
  // VariableRenderer is genuinely wired into the real send path (it
  // previously was NOT — every prior phase's tests only asserted
  // `status === 'sent'`, never inspected the actual rendered body). Fetches
  // the real message from Mailcatcher rather than trusting the DB alone.
  test('renders {{ contact.firstname }} and {{ unsubscribe_url }} in the real sent email', async ({
    assert,
  }) => {
    const { owner, project, version, execution, contact } = await createExecution()
    contact.firstName = 'Jean'
    await contact.save()

    const email = await emailService.create(project, owner, {
      name: 'Welcome',
      subject: 'Hi {{ contact.firstname }}',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent:
        '<p>Hello {{ contact.firstname }} from {{ project.name }}!</p>' +
        '<p><a href="{{ unsubscribe_url }}">Unsubscribe</a></p>',
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
    const node = await createNode(version.id, 'action', 'send_email', {
      emailId: email.id,
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
    })

    await new SendEmailExecutor().execute(execution, node, contact)

    const list = (await fetch('http://localhost:1080/messages').then((r) => r.json())) as Array<{
      id: number
      subject: string | null
    }>
    const latest = list.at(-1)!
    const messageSubject = latest.subject ?? ''
    const html = await fetch(`http://localhost:1080/messages/${latest.id}.html`).then((r) =>
      r.text()
    )

    assert.include(messageSubject, 'Jean')
    assert.notInclude(messageSubject, '{{')

    assert.include(html, 'Hello Jean from ' + project.name)
    assert.notInclude(html, '{{ contact.firstname }}')
    assert.notInclude(html, '{{ project.name }}')
    assert.notInclude(html, '{{ unsubscribe_url }}')
    // The unsubscribe href was rendered to a real URL, then rewritten by
    // TrackingContentRewriter into a click-tracking redirect — confirms
    // VariableRenderer ran BEFORE tracking rewriting, per the intended order.
    assert.match(html, /href="http:\/\/localhost:\d+\/track\/click\//)
  })
})
