import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import EmailTemplateService from '#services/emails/email_template_service'
import EmailTemplate from '#models/email_template'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const emailTemplateService = new EmailTemplateService()

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
  name: 'Welcome',
  subject: 'Welcome, {{ contact.firstname }}!',
  htmlContent: '<p>Hello {{ contact.firstname }}, unsubscribe: {{ unsubscribe_url }}</p>',
  textContent: 'Hello {{ contact.firstname }}',
}

test.group('Email templates (functional)', () => {
  test('a member can create a template', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/email-templates`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    response.assertStatus(302)

    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Welcome')
      .firstOrFail()
    assert.equal(template.subject, formPayload.subject)
  })

  test('a viewer cannot create a template', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/email-templates`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Welcome')
      .first()
    assert.isNull(template)
  })

  test('an admin can update and delete a template', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, formPayload)

    const updateResponse = await client
      .patch(
        `/organizations/${organization.id}/projects/${project.id}/email-templates/${template.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ ...formPayload, name: 'Welcome (renamed)' })
    updateResponse.assertStatus(302)

    await template.refresh()
    assert.equal(template.name, 'Welcome (renamed)')

    const deleteResponse = await client
      .delete(
        `/organizations/${organization.id}/projects/${project.id}/email-templates/${template.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    const found = await EmailTemplate.find(template.id)
    assert.isNull(found)
  })

  test('duplicate creates an independent copy', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, formPayload)

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/email-templates/${template.id}/duplicate`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    const copies = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Welcome (copie)')
    assert.lengthOf(copies, 1)
  })

  test('preview renders variables and leaves unknown tokens literal', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, {
      ...formPayload,
      htmlContent: '<p>Hi {{ contact.firstname }}, {{ mystery.token }}</p>',
      textContent: 'Hi {{ contact.firstname }}, {{ mystery.token }}',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/email-templates/${template.id}/preview`
      )
      .loginAs(owner)
      .withCsrfToken()

    response.assertStatus(200)
    assert.include(response.body().html, 'Hi Jean')
    assert.include(response.body().html, '{{ mystery.token }}')
    assert.include(response.body().text, 'Hi Jean')
    assert.include(response.body().text, '{{ mystery.token }}')
  })

  test('templates of one project are invisible from another project', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await emailTemplateService.create(project, owner, formPayload)

    const found = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('name', 'Welcome')
      .first()
    assert.isNull(found)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/email-templates`)
      .loginAs(owner)
    response.assertStatus(200)
  })

  test('a non-member gets a 404', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/email-templates`)
      .loginAs(outsider)

    response.assertStatus(404)
  })
})
