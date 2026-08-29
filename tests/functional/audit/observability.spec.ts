import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import SegmentService from '#services/segments/segment_service'
import CampaignVersion from '#models/campaign_version'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignExecutionEvent from '#models/campaign_execution_event'
import EmailDelivery from '#models/email_delivery'
import EmailEvent from '#models/email_event'
import ContactUnsubscribeEvent from '#models/contact_unsubscribe_event'

/**
 * Same extraction technique established in tests/functional/statistics/dashboard.spec.ts
 * — simpler and more reliable than spoofing `X-Inertia`/`X-Inertia-Version`
 * headers to get a raw JSON response.
 */
function inertiaProps(html: string): any {
  const match = html.match(/data-page="app"[^>]*>(.*?)<\/script>/s)
  if (!match) throw new Error('inertiaProps: no data-page script tag found in response body.')
  return JSON.parse(match[1]).props
}

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const contactService = new ContactService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const segmentService = new SegmentService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

async function inviteWithRole(
  organization: Awaited<ReturnType<typeof organizationService.create>>,
  owner: Awaited<ReturnType<typeof UserFactory.create>>,
  role: 'member' | 'viewer'
) {
  const user = await UserFactory.create()
  const invitation = await membershipService.invite(organization, owner, {
    email: user.email,
    role,
  })
  await membershipService.accept(invitation, user)
  return user
}

test.group('Observability (functional)', () => {
  test('activating a campaign produces a visible audit-log entry over HTTP', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const seg = await segmentService.save(project, {
      name: 'All',
      definition: { combinator: 'AND', conditions: [] },
    })
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)
    await builderService.saveDraft(version, {
      nodes: [
        {
          clientKey: 'src',
          type: 'source',
          subtype: 'segment',
          config: { segmentId: seg.id },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })
    await builderService.publish(version, owner)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/audit-log`)
      .loginAs(owner)
    response.assertStatus(200)

    const props = inertiaProps(response.text())
    assert.isTrue(
      props.logs.data.some((row: { action: string }) => row.action === 'campaign.activated')
    )
  })

  test('contact history merges enrollment, execution events, email events, and unsubscribe events', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })

    const seg = await segmentService.save(project, {
      name: 'All',
      definition: { combinator: 'AND', conditions: [] },
    })
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const draftVersion = await CampaignVersion.findOrFail(campaign.draftVersionId)
    await builderService.saveDraft(draftVersion, {
      nodes: [
        {
          clientKey: 'src',
          type: 'source',
          subtype: 'segment',
          config: { segmentId: seg.id },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })
    const publishedVersion = await builderService.publish(draftVersion, owner)

    const enrollment = await CampaignEnrollment.create({
      projectId: project.id,
      campaignId: campaign.id,
      campaignVersionId: publishedVersion.id,
      contactId: contact.id,
      status: 'active',
      source: `segment:${seg.id}`,
      enrolledAt: DateTime.now().minus({ minutes: 30 }),
    })
    const execution = await CampaignExecution.create({
      campaignEnrollmentId: enrollment.id,
      status: 'completed',
      scheduledAt: DateTime.now().minus({ minutes: 30 }),
    })
    await CampaignExecutionEvent.create({
      campaignExecutionId: execution.id,
      nodeId: null,
      type: 'node_executed',
      message: 'source reached',
      occurredAt: DateTime.now().minus({ minutes: 29 }),
    })

    const delivery = await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      campaignExecutionId: execution.id,
      contactId: contact.id,
      idempotencyKey: `${execution.id}:manual-test`,
      status: 'sent',
      sentAt: DateTime.now().minus({ minutes: 20 }),
    })
    await EmailEvent.create({
      projectId: project.id,
      emailDeliveryId: delivery.id,
      contactId: contact.id,
      type: 'opened',
      occurredAt: DateTime.now().minus({ minutes: 10 }),
    })

    await ContactUnsubscribeEvent.create({
      projectId: project.id,
      contactId: contact.id,
      campaignId: campaign.id,
      source: 'manual',
      occurredAt: DateTime.now().minus({ minutes: 5 }),
    })

    const response = await client
      .get(
        `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/history`
      )
      .loginAs(owner)
    response.assertStatus(200)

    const props = inertiaProps(response.text())
    const entries = props.history.data as Array<{ kind: string; occurredAt: string }>
    const kinds = entries.map((e) => e.kind)
    assert.includeMembers(kinds, [
      'enrollment',
      'execution_event',
      'email_event',
      'unsubscribe_event',
    ])

    // Newest first.
    const timestamps = entries.map((e) => new Date(e.occurredAt).getTime())
    const sorted = [...timestamps].sort((a, b) => b - a)
    assert.deepEqual(timestamps, sorted)
  })

  test('viewer/member are blocked from the audit log and failed jobs, but allowed to view contact history', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    const viewer = await inviteWithRole(organization, owner, 'viewer')
    const member = await inviteWithRole(organization, owner, 'member')

    for (const user of [viewer, member]) {
      const auditResponse = await client
        .get(`/organizations/${organization.id}/projects/${project.id}/settings/audit-log`)
        .loginAs(user)
        .redirects(0)
      assert.notEqual(auditResponse.response.statusCode, 200)

      const jobsResponse = await client
        .get(`/organizations/${organization.id}/projects/${project.id}/settings/jobs`)
        .loginAs(user)
        .redirects(0)
      assert.notEqual(jobsResponse.response.statusCode, 200)

      const historyResponse = await client
        .get(
          `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/history`
        )
        .loginAs(user)
      historyResponse.assertStatus(200)
    }

    // Owner/admin genuinely can reach both restricted screens.
    const ownerAudit = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/audit-log`)
      .loginAs(owner)
    ownerAudit.assertStatus(200)

    const ownerJobs = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/jobs`)
      .loginAs(owner)
    ownerJobs.assertStatus(200)
  })
})
