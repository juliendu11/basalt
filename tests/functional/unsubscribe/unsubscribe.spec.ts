import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import EmailService from '#services/emails/email_service'
import UnsubscribeTokenService from '#services/unsubscribe/unsubscribe_token_service'
import Contact from '#models/contact'
import CampaignVersion from '#models/campaign_version'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignEngineService from '#services/automation/campaign_engine_service'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const emailService = new EmailService()
const unsubscribeTokenService = new UnsubscribeTokenService()
const engine = new CampaignEngineService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
  return { owner, organization, project, contact }
}

test.group('Unsubscribe (public link)', () => {
  test('a valid token unsubscribes the contact and shows a confirmation, without leaking contact data', async ({
    client,
    assert,
  }) => {
    const { project, contact } = await createFixtures()
    const token = await unsubscribeTokenService.getOrCreate(project, contact)

    const response = await client.get(`/unsubscribe/${token.token}`)

    response.assertStatus(200)
    assert.notInclude(response.text(), contact.email)

    await contact.refresh()
    assert.equal(contact.status, 'unsubscribed')
  })

  test('an invalid token still returns 200 with a generic message, never an error or contact data', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/unsubscribe/this-token-does-not-exist')

    response.assertStatus(200)
    assert.notInclude(response.text(), '@example.com')
  })

  test('clicking the same link twice remains a clean no-op the second time', async ({
    client,
    assert,
  }) => {
    const { project, contact } = await createFixtures()
    const token = await unsubscribeTokenService.getOrCreate(project, contact)

    await client.get(`/unsubscribe/${token.token}`)
    const second = await client.get(`/unsubscribe/${token.token}`)

    second.assertStatus(200)
    await contact.refresh()
    assert.equal(contact.status, 'unsubscribed')
  })
})

test.group('Contacts unsubscribe/resubscribe (manual, authenticated)', () => {
  test('a member can manually unsubscribe a contact', async ({ client, assert }) => {
    const { owner, organization, project, contact } = await createFixtures()

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/unsubscribe`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    await contact.refresh()
    assert.equal(contact.status, 'unsubscribed')
  })

  test('a viewer cannot manually unsubscribe a contact', async ({ client, assert }) => {
    const { owner, organization, project, contact } = await createFixtures()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/unsubscribe`
      )
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    await contact.refresh()
    assert.equal(contact.status, 'subscribed')
  })

  test('an admin can resubscribe a contact', async ({ client, assert }) => {
    const { owner, organization, project, contact } = await createFixtures()
    await contactService.changeStatus(contact, 'unsubscribed')

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/resubscribe`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    await contact.refresh()
    assert.equal(contact.status, 'subscribed')
  })

  test('a member (not admin) cannot resubscribe a contact — stricter than unsubscribe', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project, contact } = await createFixtures()
    await contactService.changeStatus(contact, 'unsubscribed')
    const member = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: member.email,
      role: 'member',
    })
    await membershipService.accept(invitation, member)

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}/resubscribe`
      )
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    await contact.refresh()
    assert.equal(contact.status, 'unsubscribed')
  })
})

test.group('Unsubscribe reachable from every non-subscribed status', () => {
  test('bounced/complained/blocked contacts can all be unsubscribed via the public link', async ({
    client,
    assert,
  }) => {
    for (const startingStatus of ['bounced', 'complained', 'blocked'] as const) {
      const { project, contact } = await createFixtures()
      await contactService.changeStatus(contact, startingStatus)
      const token = await unsubscribeTokenService.getOrCreate(project, contact)

      const response = await client.get(`/unsubscribe/${token.token}`)

      response.assertStatus(200)
      const updated = await Contact.findOrFail(contact.id)
      assert.equal(updated.status, 'unsubscribed')
    }
  })
})

// Shared coverage with docs/plans/12-campaign-engine.md's Scenario 7 test
// (tests/functional/automation/campaign_engine_scenarios.spec.ts), exercised
// here from the unsubscribe domain's own entry point — the public link —
// rather than a direct service call, per docs/plans/17-unsubscribe.md §
// Testing strategy.
test.group('Unsubscribing via the link skips a pending send in an active campaign', () => {
  test('clicking the link before a scheduled send_email node causes it to be skipped, not blocked', async ({
    client,
    assert,
  }) => {
    const { owner, project, contact } = await createFixtures()
    const segment = await segmentService.save(project, {
      name: 'Everyone',
      definition: { combinator: 'AND', conditions: [] },
    })
    const email = await emailService.create(project, owner, {
      name: 'Reminder',
      subject: 'Reminder',
      senderName: 'Acme',
      senderEmail: 'hello@acme.test',
      htmlContent: '<p>Reminder!</p>',
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

    // Contact unsubscribes via the real public link before the engine
    // ever reaches the send_email node.
    const token = await unsubscribeTokenService.getOrCreate(project, contact)
    await client.get(`/unsubscribe/${token.token}`)

    await engine.advance({ executionId: execution.id }) // source
    await engine.advance({ executionId: execution.id }) // send (skipped)
    await execution.refresh()
    await enrollment.refresh()

    assert.equal(execution.status, 'completed')
    assert.equal(enrollment.status, 'completed')

    const deliveries = await db.from('email_deliveries').where('contact_id', contact.id)
    assert.lengthOf(deliveries, 0)
  })
})
