import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import Campaign from '#models/campaign'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const campaignService = new CampaignService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

test.group('Campaigns (functional)', () => {
  test('a member can create a campaign', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/campaigns`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Welcome series', description: 'Onboards new users' })

    response.assertStatus(302)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Welcome series')
      .firstOrFail()
    assert.equal(campaign.status, 'draft')
    assert.isNotNull(campaign.draftVersionId)
    assert.isFalse(campaign.enrollExistingMembers)
  })

  test('enrollExistingMembers defaults to false when omitted from the create payload', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/campaigns`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'No opt-in' })

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'No opt-in')
      .firstOrFail()
    assert.isFalse(campaign.enrollExistingMembers)
  })

  test('enrollExistingMembers can be opted into at creation with a real boolean', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/campaigns`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Opt-in boolean', enrollExistingMembers: true })

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Opt-in boolean')
      .firstOrFail()
    assert.isTrue(campaign.enrollExistingMembers)
  })

  test('enrollExistingMembers can be opted into with the "true" string a native checkbox submits', async ({
    client,
    assert,
  }) => {
    // The create form's checkbox is a plain <input type="checkbox"
    // value="true">, so the wire value is the string "true", not a JS
    // boolean — `vine.boolean()` (non-strict) must coerce it.
    const { owner, organization, project } = await createProject()

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/campaigns`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Opt-in checkbox string', enrollExistingMembers: 'true' })

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Opt-in checkbox string')
      .firstOrFail()
    assert.isTrue(campaign.enrollExistingMembers)
  })

  test('a viewer cannot create a campaign', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/campaigns`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Nope' })

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Nope')
      .first()
    assert.isNull(campaign)
  })

  test('a campaign of another project is not visible (404)', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Project A campaign' })

    // Same user, same organization, a second (unrelated) project — the
    // campaign must not be reachable through it.
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other project',
      timezone: 'Europe/Paris',
    })

    const response = await client
      .get(`/organizations/${organization.id}/projects/${otherProject.id}/campaigns/${campaign.id}`)
      .loginAs(owner)
    response.assertStatus(404)

    assert.notEqual(otherProject.id, project.id)
  })

  test('pause/resume/archive lifecycle via HTTP', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    campaign.status = 'active'
    await campaign.save()

    const pauseResponse = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}/pause`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    pauseResponse.assertStatus(302)
    await campaign.refresh()
    assert.equal(campaign.status, 'paused')

    const resumeResponse = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}/resume`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    resumeResponse.assertStatus(302)
    await campaign.refresh()
    assert.equal(campaign.status, 'active')

    const archiveResponse = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}/archive`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    archiveResponse.assertStatus(302)
    await campaign.refresh()
    assert.equal(campaign.status, 'archived')
  })

  test('activate rejects an empty/invalid graph rather than succeeding', async ({
    client,
    assert,
  }) => {
    // The builder (docs/plans/11-campaign-builder.md, Phase 9) now
    // implements real publish/graph-validation; a campaign with no graph
    // at all fails structural validation (no source node) — the important
    // guarantee is that a BusinessRuleViolation redirects back (302) with
    // a flash error rather than a 500, and never leaves the campaign
    // activated on an invalid graph.
    const { owner, organization, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}/activate`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    await campaign.refresh()
    assert.equal(campaign.status, 'draft')
  })
})
