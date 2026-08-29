import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import CustomFieldDefinitionService from '#services/custom_fields/custom_field_definition_service'
import CustomFieldDefinition from '#models/custom_field_definition'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const customFieldDefinitionService = new CustomFieldDefinitionService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

test.group('Custom field definitions (functional)', () => {
  test('a member can create a custom field', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/custom-fields`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ key: 'age', label: 'Age', type: 'number' })

    response.assertStatus(302)

    const definition = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('key', 'age')
      .firstOrFail()
    assert.equal(definition.label, 'Age')
    assert.equal(definition.type, 'number')
  })

  test('a viewer cannot create a custom field', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/custom-fields`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ key: 'age', label: 'Age', type: 'number' })

    const definition = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('key', 'age')
      .first()
    assert.isNull(definition)
  })

  test('the key must be unique per project', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const definition = await customFieldDefinitionService.create(project, {
      key: 'age',
      label: 'Age',
      type: 'number',
    })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/custom-fields`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ key: 'age', label: 'Age again', type: 'text' })

    response.assertStatus(302)

    // The rejected submission never created a second row — the existing
    // definition (and its type) is untouched.
    const count = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('key', 'age')
    assert.lengthOf(count, 1)
    await definition.refresh()
    assert.equal(definition.type, 'number')
  })

  test('a project member can rename a custom field, key and type stay fixed', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const definition = await customFieldDefinitionService.create(project, {
      key: 'age',
      label: 'Age',
      type: 'number',
    })

    const response = await client
      .patch(
        `/organizations/${organization.id}/projects/${project.id}/settings/custom-fields/${definition.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ label: 'Contact age' })
    response.assertStatus(302)

    await definition.refresh()
    assert.equal(definition.label, 'Contact age')
    assert.equal(definition.key, 'age')
    assert.equal(definition.type, 'number')
  })

  test('an admin can delete a custom field', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const definition = await customFieldDefinitionService.create(project, {
      key: 'age',
      label: 'Age',
      type: 'number',
    })

    const response = await client
      .delete(
        `/organizations/${organization.id}/projects/${project.id}/settings/custom-fields/${definition.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    const found = await CustomFieldDefinition.find(definition.id)
    assert.isNull(found)
  })

  test('custom fields of one project are invisible from another project', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await customFieldDefinitionService.create(project, { key: 'age', label: 'Age', type: 'number' })

    const found = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('key', 'age')
      .first()
    assert.isNull(found)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/custom-fields`)
      .loginAs(owner)
    response.assertStatus(200)
  })
})
