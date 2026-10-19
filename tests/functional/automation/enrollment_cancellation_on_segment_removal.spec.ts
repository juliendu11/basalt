import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import EmailService from '#services/emails/email_service'
import UpcomingSendsService from '#services/automation/upcoming_sends_service'
import CampaignVersion from '#models/campaign_version'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'
import CampaignService from '#services/campaigns/campaign_service'
import SegmentService from '#services/segments/segment_service'
import TagService from '#services/tags/tag_service'
import CampaignEngineService from '#services/automation/campaign_engine_service'
import type QueueDispatcher from '#services/jobs/queue_dispatcher'
import CancelEnrollmentsOnSegmentMembershipRemoved from '#listeners/cancel_enrollments_on_segment_membership_removed'
import SegmentMembershipRemoved from '#events/segment_membership_removed'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import Tag from '#models/tag'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = await app.container.make(SegmentService)
const campaignService = await app.container.make(CampaignService)
const builderService = await app.container.make(CampaignBuilderService)
const emailService = await app.container.make(EmailService)
const upcomingSends = new UpcomingSendsService()
const engine = await app.container.make(CampaignEngineService)
const listener = new CancelEnrollmentsOnSegmentMembershipRemoved()

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

async function enroll(
  owner: Awaited<ReturnType<typeof UserFactory.create>>,
  project: Awaited<ReturnType<typeof projectService.create>>,
  contactId: number,
  source: string,
  status: 'pending' | 'waiting' = 'waiting'
) {
  const campaign = await campaignService.create(project, owner, { name: 'Drip' })
  const enrollment = await CampaignEnrollment.create({
    projectId: project.id,
    campaignId: campaign.id,
    campaignVersionId: campaign.draftVersionId!,
    contactId,
    status: 'active',
    source,
    enrolledAt: DateTime.now(),
  })
  const execution = await CampaignExecution.create({
    campaignEnrollmentId: enrollment.id,
    status,
    scheduledAt: DateTime.now().plus({ days: 1 }),
  })
  return { enrollment, execution }
}

test.group('Cancel enrollments when a contact leaves a segment', () => {
  test('cancels the active enrollment and its pending send', async ({ assert }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { enrollment, execution } = await enroll(
      owner,
      project,
      contact.id,
      `segment:${segment.id}`
    )

    await listener.handle(new SegmentMembershipRemoved(segment.id, [contact.id]))

    await enrollment.refresh()
    await execution.refresh()
    assert.equal(enrollment.status, 'cancelled')
    assert.equal(enrollment.exitReason, 'removed from segment')
    assert.equal(execution.status, 'cancelled')
  })

  test('leaves enrollments from another segment or for another contact untouched', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const other = await contactService.create(project, owner, { email: 'b@example.com' })
    const otherSegment = await segmentService.save(project, {
      name: 'Other',
      definition: { combinator: 'AND', conditions: [] },
    })

    const fromOtherSegment = await enroll(owner, project, contact.id, `segment:${otherSegment.id}`)
    const otherContact = await enroll(owner, project, other.id, `segment:${segment.id}`)

    await listener.handle(new SegmentMembershipRemoved(segment.id, [contact.id]))

    await fromOtherSegment.enrollment.refresh()
    await otherContact.enrollment.refresh()
    await otherContact.execution.refresh()
    assert.equal(fromOtherSegment.enrollment.status, 'active')
    assert.equal(otherContact.enrollment.status, 'active')
    assert.equal(otherContact.execution.status, 'waiting')
  })

  test('manually excluding a contact from a segment cancels its enrollment', async ({ assert }) => {
    const { owner, project, contact, segment } = await createFixtures()
    await db.table('segment_contacts').insert({
      segment_id: segment.id,
      contact_id: contact.id,
      added_at: DateTime.now().toSQL({ includeOffset: false }),
    })
    const { enrollment } = await enroll(owner, project, contact.id, `segment:${segment.id}`)

    await segment.refresh() // `save()` returns the instance without DB defaults like contactCountCache
    await segmentService.excludeContact(segment, contact.id)

    await enrollment.refresh()
    assert.equal(enrollment.status, 'cancelled')
  })

  test('a due execution of a cancelled enrollment sends nothing', async ({ assert }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { execution } = await enroll(
      owner,
      project,
      contact.id,
      `segment:${segment.id}`,
      'pending'
    )

    await listener.handle(new SegmentMembershipRemoved(segment.id, [contact.id]))
    await engine.advance({ executionId: execution.id })

    await execution.refresh()
    assert.equal(execution.status, 'cancelled')
    assert.lengthOf(await db.from('email_deliveries').where('contact_id', contact.id), 0)
  })
})

test.group('Manual segment exclusion — scheduled emails', () => {
  test("removes the excluded contact's upcoming sends and keeps the others'", async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const other = await contactService.create(project, owner, { email: 'b@example.com' })

    const email = await emailService.create(project, owner, {
      name: 'Welcome',
      subject: 'Welcome!',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent: '<p>Hi</p>',
    })
    const campaign = await campaignService.create(project, owner, { name: 'Onboarding' })
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
        clientKey: 'wait',
        type: 'action',
        subtype: 'wait',
        config: { durationValue: 2, durationUnit: 'days' },
        position: { x: 100, y: 0 },
      },
      {
        clientKey: 'send',
        type: 'action',
        subtype: 'send_email',
        config: { emailId: email.id },
        position: { x: 200, y: 0 },
      },
    ]
    const edges: BuilderEdge[] = [
      { sourceClientKey: 'src', targetClientKey: 'wait', sourceHandle: null },
      { sourceClientKey: 'wait', targetClientKey: 'send', sourceHandle: null },
    ]
    await builderService.saveDraft(draft, { nodes, edges })
    const version = await builderService.publish(draft, owner)
    await campaign.refresh() // pick up publishedVersionId, needed by forCampaign

    for (const member of [contact, other]) {
      await db.table('segment_contacts').insert({
        segment_id: segment.id,
        contact_id: member.id,
        added_at: DateTime.now().toSQL({ includeOffset: false }),
      })
      const enrollment = await CampaignEnrollment.create({
        projectId: project.id,
        campaignId: campaign.id,
        campaignVersionId: version.id,
        contactId: member.id,
        status: 'active',
        source: `segment:${segment.id}`,
        enrolledAt: DateTime.now(),
      })
      await CampaignExecution.create({
        campaignEnrollmentId: enrollment.id,
        status: 'pending',
        currentNodeId: null,
        scheduledAt: DateTime.now(),
      })
    }

    assert.lengthOf(await upcomingSends.forContact(contact), 1)
    assert.lengthOf(await upcomingSends.forContact(other), 1)

    await segment.refresh() // `save()` returns the instance without DB defaults like contactCountCache
    await segmentService.excludeContact(segment, contact.id)

    assert.lengthOf(await upcomingSends.forContact(contact), 0)
    assert.lengthOf(await upcomingSends.forContact(other), 1)
    assert.lengthOf((await upcomingSends.forCampaign(campaign)).data, 1)
  })
})

test.group('TagService.delete', () => {
  test('recomputes the project segments that filter on tags, and only those', async ({
    assert,
  }) => {
    const { project } = await createFixtures()
    const tag = await Tag.create({ projectId: project.id, name: 'vip', color: '#22c55e' })
    const tagSegment = await segmentService.save(project, {
      name: 'VIPs',
      definition: {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'in', value: [tag.id] }],
      },
    })

    const dispatched: Array<{ segmentId: number; mode: string }> = []
    const queueDispatcher = {
      dispatch: async (_queue: string, _job: string, payload: any) => {
        dispatched.push(payload)
      },
    } as unknown as QueueDispatcher

    await new TagService(queueDispatcher).delete(tag)

    assert.deepEqual(dispatched, [{ segmentId: tagSegment.id, mode: 'full' }])
    assert.isNull(await Tag.find(tag.id))
  })
})
