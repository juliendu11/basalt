import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import EmailService from '#services/emails/email_service'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import UpcomingSendsService from '#services/automation/upcoming_sends_service'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const emailService = new EmailService()
const upcomingSends = new UpcomingSendsService()

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

/** Publishes { source -> send_email(A) -> wait 2 days -> send_email(B) } and returns the published version. */
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

  return { campaign, version: published }
}

test.group('UpcomingSendsService', () => {
  test('a fresh pending execution projects every send ahead, marking post-wait ones estimated', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)

    const enrollment = await CampaignEnrollment.create({
      projectId: project.id,
      campaignId: campaign.id,
      campaignVersionId: version.id,
      contactId: contact.id,
      status: 'active',
      source: 'test',
      enrolledAt: DateTime.now(),
    })
    await CampaignExecution.create({
      campaignEnrollmentId: enrollment.id,
      status: 'pending',
      currentNodeId: null,
      scheduledAt: DateTime.now(),
    })

    const sends = await upcomingSends.forContact(contact)

    assert.lengthOf(sends, 2)
    assert.equal(sends[0].subject, 'First email')
    assert.equal(sends[0].certainty, 'scheduled')
    assert.equal(sends[1].subject, 'Second email')
    assert.equal(sends[1].certainty, 'estimated')
    assert.isTrue(sends[1].estimatedSendAt > DateTime.now().plus({ days: 1 }))
  })

  test('an execution waiting on a wait node projects only the sends past it, at scheduledAt', async ({
    assert,
  }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)

    const waitNode = await CampaignNode.query()
      .where('campaignVersionId', version.id)
      .where('subtype', 'wait')
      .firstOrFail()

    const enrollment = await CampaignEnrollment.create({
      projectId: project.id,
      campaignId: campaign.id,
      campaignVersionId: version.id,
      contactId: contact.id,
      status: 'active',
      source: 'test',
      enrolledAt: DateTime.now(),
    })
    const scheduledAt = DateTime.now().plus({ days: 2 })
    await CampaignExecution.create({
      campaignEnrollmentId: enrollment.id,
      status: 'waiting',
      currentNodeId: waitNode.id,
      scheduledAt,
    })

    const contactSends = await upcomingSends.forContact(contact)
    assert.lengthOf(contactSends, 1)
    assert.equal(contactSends[0].subject, 'Second email')
    assert.equal(contactSends[0].certainty, 'scheduled')
    // ETA is the engine's own scheduledAt, untouched (DB round-trip loses sub-second precision).
    assert.isBelow(Math.abs(contactSends[0].estimatedSendAt.diff(scheduledAt).as('seconds')), 1)

    const campaignSends = await upcomingSends.forCampaign(campaign)
    assert.lengthOf(campaignSends.data, 1)
    assert.equal(campaignSends.data[0].contactEmail, 'a@example.com')
    assert.equal(campaignSends.data[0].subject, 'Second email')
  })

  test('completed executions produce no upcoming sends', async ({ assert }) => {
    const { owner, project, contact, segment } = await createFixtures()
    const { campaign, version } = await publishTwoEmailWaitGraph(owner, project, segment.id)

    const enrollment = await CampaignEnrollment.create({
      projectId: project.id,
      campaignId: campaign.id,
      campaignVersionId: version.id,
      contactId: contact.id,
      status: 'completed',
      source: 'test',
      enrolledAt: DateTime.now(),
    })
    await CampaignExecution.create({
      campaignEnrollmentId: enrollment.id,
      status: 'completed',
      currentNodeId: null,
      scheduledAt: DateTime.now(),
    })

    const campaignSends = await upcomingSends.forCampaign(campaign)
    assert.lengthOf(await upcomingSends.forContact(contact), 0)
    assert.lengthOf(campaignSends.data, 0)
  })
})
