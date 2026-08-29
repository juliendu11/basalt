import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import EmailLayoutService from '#services/emails/email_layout_service'
import EmailLayout from '#models/email_layout'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const emailLayoutService = new EmailLayoutService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

const formPayload = {
  name: 'Branding frame',
  htmlContent: '<header>Acme</header>{{ email_body }}<footer>{{ unsubscribe_url }}</footer>',
  textContent: 'Acme\n{{ email_body }}\n{{ unsubscribe_url }}',
}

test.group('Email layouts (functional)', () => {
  test('a member can create a layout', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/email-layouts`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    response.assertStatus(302)

    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Branding frame')
      .firstOrFail()
    assert.equal(layout.htmlContent, formPayload.htmlContent)
    assert.equal(layout.textContent, formPayload.textContent)
  })

  test('a viewer cannot create a layout', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/email-layouts`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Branding frame')
      .first()
    assert.isNull(layout)
  })

  test('an admin can update and delete a layout', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, formPayload)

    const updateResponse = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/email-layouts/${layout.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ ...formPayload, name: 'Branding frame (renamed)' })
    updateResponse.assertStatus(302)

    await layout.refresh()
    assert.equal(layout.name, 'Branding frame (renamed)')

    const deleteResponse = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}/email-layouts/${layout.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    const found = await EmailLayout.find(layout.id)
    assert.isNull(found)
  })

  test('duplicate creates an independent copy', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, formPayload)

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/email-layouts/${layout.id}/duplicate`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    const copies = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Branding frame (copie)')
    assert.lengthOf(copies, 1)
  })

  test('preview composes an example body and renders variables', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme, {{ mystery.token }}</header>{{ email_body }}',
      textContent: 'Acme, {{ mystery.token }}\n{{ email_body }}',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/email-layouts/${layout.id}/preview`
      )
      .loginAs(owner)
      .withCsrfToken()

    response.assertStatus(200)
    assert.include(response.body().html, 'Your email content will appear here')
    assert.include(response.body().html, '{{ mystery.token }}')
    assert.include(response.body().text, 'Your email content will appear here')
    assert.include(response.body().text, '{{ mystery.token }}')
  })

  test('preview text falls back to the raw example fragment when the layout has no text frame', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme</header>{{ email_body }}',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/email-layouts/${layout.id}/preview`
      )
      .loginAs(owner)
      .withCsrfToken()

    response.assertStatus(200)
    assert.equal(response.body().text, 'Your email content will appear here.')
  })

  test('layouts of one project are invisible from another project', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await emailLayoutService.create(project, owner, formPayload)

    const found = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('name', 'Branding frame')
      .first()
    assert.isNull(found)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/email-layouts`)
      .loginAs(owner)
    response.assertStatus(200)
  })

  test('a non-member gets a 404', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/email-layouts`)
      .loginAs(outsider)

    response.assertStatus(404)
  })
})
