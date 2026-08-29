import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import CampaignService from '#services/campaigns/campaign_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const campaignService = new CampaignService()
const membershipService = new OrganizationMembershipService()

async function createProject(name = 'Marketing') {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: `Acme ${name}` })
  const project = await projectService.create(organization, owner, {
    name,
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

/**
 * Extracts the Inertia page's `props` from a full HTML response body
 * (the `data-page` JSON blob) — simpler and more reliable in this test
 * suite than sending `X-Inertia: true` (which 409s without also spoofing
 * a matching `X-Inertia-Version` header, forcing Inertia's own
 * stale-asset-version full-reload protocol).
 */
function inertiaProps(html: string): any {
  const match = html.match(/data-page="app"[^>]*>(.*?)<\/script>/s)
  if (!match) throw new Error('inertiaProps: no data-page script tag found in response body.')
  return JSON.parse(match[1]).props
}

async function insertDailyStat(projectId: number, date: DateTime, sent: number) {
  const now = DateTime.now().toSQL({ includeOffset: false })
  await db.table('project_daily_stats').insert({
    project_id: projectId,
    date: date.toISODate()!,
    contacts_total: 1,
    contacts_active: 1,
    emails_sent: sent,
    emails_delivered: 0,
    emails_opened: 0,
    emails_clicked: 0,
    emails_bounced: 0,
    emails_failed: 0,
    unsubscribes: 0,
    created_at: now,
    updated_at: now,
  })
}

test.group('Statistics dashboard (functional)', () => {
  test('reflects a few days of simulated activity through the real HTTP route', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')
    await insertDailyStat(project.id, yesterday, 7)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/dashboard`)
      .qs({ period: 'last_7_days' })
      .loginAs(owner)

    response.assertStatus(200)
    assert.equal(inertiaProps(response.text()).summary.sent, 7)
  })

  test('a viewer can see the dashboard (read-only, no restriction)', async ({ client }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/dashboard`)
      .loginAs(viewer)

    response.assertStatus(200)
  })

  test("project A's statistics never leak into project B's dashboard", async ({
    client,
    assert,
  }) => {
    const { owner: ownerA, organization: orgA, project: projectA } = await createProject('A')
    const { owner: ownerB, organization: orgB, project: projectB } = await createProject('B')

    const day = DateTime.now().minus({ days: 1 }).startOf('day')
    await insertDailyStat(projectA.id, day, 50)
    await insertDailyStat(projectB.id, day, 3)

    const responseA = await client
      .get(`/organizations/${orgA.id}/projects/${projectA.id}/dashboard`)
      .loginAs(ownerA)
    const responseB = await client
      .get(`/organizations/${orgB.id}/projects/${projectB.id}/dashboard`)
      .loginAs(ownerB)

    assert.equal(inertiaProps(responseA.text()).summary.sent, 50)
    assert.equal(inertiaProps(responseB.text()).summary.sent, 3)
  })

  test('campaign statistics page shows the campaign scoped totals', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'a@example.com' })
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })

    const now = DateTime.now().toSQL({ includeOffset: false })
    await db.table('email_deliveries').insert({
      project_id: project.id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      idempotency_key: '999:888',
      status: 'sent',
      created_at: now,
      updated_at: now,
    })

    const response = await client
      .get(
        `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}/statistics`
      )
      .loginAs(owner)

    response.assertStatus(200)
    assert.equal(inertiaProps(response.text()).summary.sent, 1)
  })

  test('an invalid custom period redirects back with a flash error, not a 500', async ({
    client,
  }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/dashboard`)
      .qs({ period: 'custom', from: '2025-06-01', to: '2020-01-01' })
      .loginAs(owner)
      .redirects(0)

    response.assertStatus(302)
  })
})
