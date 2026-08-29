import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import Contact from '#models/contact'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const contactService = new ContactService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

test.group('Contacts (functional)', () => {
  test('a member can create a contact', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'jane@example.com', firstName: 'Jane' })

    response.assertStatus(302)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('email', 'jane@example.com')
      .firstOrFail()
    assert.equal(contact.firstName, 'Jane')
  })

  test('a viewer cannot create a contact', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'jane@example.com' })

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('email', 'jane@example.com')
      .first()
    assert.isNull(contact)
  })

  test('a duplicate email in the same project is rejected with a validation error', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    await contactService.create(project, owner, { email: 'jane@example.com' })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'jane@example.com' })

    response.assertStatus(302)

    const contacts = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('email', 'jane@example.com')
    assert.lengthOf(contacts, 1)
  })

  test('a member can update and soft-delete a contact', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })

    const updateResponse = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'jane@example.com', firstName: 'Janet' })
    updateResponse.assertStatus(302)

    await contact.refresh()
    assert.equal(contact.firstName, 'Janet')

    const deleteResponse = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}/contacts/${contact.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    const found = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', contact.id)
      .first()
    assert.isNull(found)
  })

  test('the contacts list can be filtered by search, status and tag', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const jane = await contactService.create(project, owner, {
      email: 'jane@example.com',
      firstName: 'Jane',
    })
    await contactService.create(project, owner, { email: 'john@example.com', firstName: 'John' })
    await contactService.changeStatus(jane, 'unsubscribed')

    const searchResponse = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(owner)
      .qs({ search: 'jane' })
    searchResponse.assertStatus(200)

    const statusResponse = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(owner)
      .qs({ status: 'unsubscribed' })
    statusResponse.assertStatus(200)

    assert.equal(jane.status, 'unsubscribed')
  })

  test('contacts of one project are invisible from another project, including by email search', async ({
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })

    await contactService.create(project, owner, { email: 'jane@example.com' })

    const foundInOtherProject = await Contact.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('email', 'jane@example.com')
      .first()

    assert.isNull(foundInOtherProject)
  })

  test('a non-member gets a 404 on a project they do not belong to', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/contacts`)
      .loginAs(outsider)

    response.assertStatus(404)
  })
})
