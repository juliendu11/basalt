import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import CampaignEnrollmentService from '#services/campaigns/campaign_enrollment_service'
import CampaignVersion from '#models/campaign_version'
import CampaignEnrollment from '#models/campaign_enrollment'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const enrollmentService = new CampaignEnrollmentService()

async function createFixtures(reentryPolicy?: 'never' | 'after_exit' | 'always') {
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

  const campaign = await campaignService.create(project, owner, {
    name: 'Welcome series',
    reentryPolicy,
  })
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
      config: { durationValue: 1, durationUnit: 'days' },
      position: { x: 100, y: 0 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'wait', sourceHandle: null },
  ]
  await builderService.saveDraft(draft, { nodes, edges })
  await builderService.publish(draft, owner)
  await campaign.refresh()

  return { owner, project, contact, segment, campaign }
}

test.group('CampaignEnrollmentService.enroll', () => {
  test('first entry creates an active enrollment and a pending execution', async ({ assert }) => {
    const { project, contact, segment, campaign } = await createFixtures()

    await enrollmentService.enroll(campaign, contact, segment.id)

    const enrollment = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .firstOrFail()
    assert.equal(enrollment.status, 'active')
    assert.equal(enrollment.projectId, project.id)
    assert.equal(enrollment.campaignVersionId, campaign.publishedVersionId)
    assert.equal(enrollment.source, `segment:${segment.id}`)

    const execution = await enrollment.related('execution').query().firstOrFail()
    assert.equal(execution.status, 'pending')
  })

  test('a paused campaign accepts no new enrollment', async ({ assert }) => {
    const { contact, segment, campaign } = await createFixtures()
    campaign.status = 'paused'
    await campaign.save()

    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 0)
  })

  test('a completed campaign accepts no new enrollment', async ({ assert }) => {
    const { contact, segment, campaign } = await createFixtures()
    campaign.status = 'completed'
    await campaign.save()

    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 0)
  })

  test('an unsubscribed contact is not enrolled', async ({ assert }) => {
    const { contact, segment, campaign } = await createFixtures()
    await contactService.changeStatus(contact, 'unsubscribed')

    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 0)
  })

  test('a blocked contact is not enrolled', async ({ assert }) => {
    const { contact, segment, campaign } = await createFixtures()
    await contactService.changeStatus(contact, 'blocked')

    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 0)
  })

  test('an already-active enrollment is not duplicated', async ({ assert }) => {
    const { contact, segment, campaign } = await createFixtures()

    await enrollmentService.enroll(campaign, contact, segment.id)
    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 1)
  })

  test('reentry_policy "never": a contact with any prior enrollment is never re-enrolled, even after it went terminal', async ({
    assert,
  }) => {
    const { contact, segment, campaign } = await createFixtures('never')

    await enrollmentService.enroll(campaign, contact, segment.id)
    const first = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .firstOrFail()
    first.status = 'completed'
    first.exitedAt = DateTime.now()
    await first.save()

    await enrollmentService.enroll(campaign, contact, segment.id)

    const count = await CampaignEnrollment.query().where('campaignId', campaign.id)
    assert.lengthOf(count, 1)
  })

  test('reentry_policy "after_exit": blocked while the prior enrollment is still active, allowed once it is terminal', async ({
    assert,
  }) => {
    const { contact, segment, campaign } = await createFixtures('after_exit')

    await enrollmentService.enroll(campaign, contact, segment.id)
    const first = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .firstOrFail()

    // Still active -> a second attempt is a no-op (covered by step 3 too).
    await enrollmentService.enroll(campaign, contact, segment.id)
    assert.lengthOf(await CampaignEnrollment.query().where('campaignId', campaign.id), 1)

    first.status = 'exited'
    first.exitedAt = DateTime.now()
    await first.save()

    await enrollmentService.enroll(campaign, contact, segment.id)
    assert.lengthOf(await CampaignEnrollment.query().where('campaignId', campaign.id), 2)
  })

  test('reentry_policy "always": re-enrollable immediately after a terminal enrollment', async ({
    assert,
  }) => {
    const { contact, segment, campaign } = await createFixtures('always')

    await enrollmentService.enroll(campaign, contact, segment.id)
    const first = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .firstOrFail()
    first.status = 'cancelled'
    first.exitedAt = DateTime.now()
    await first.save()

    await enrollmentService.enroll(campaign, contact, segment.id)

    assert.lengthOf(await CampaignEnrollment.query().where('campaignId', campaign.id), 2)
  })
})
