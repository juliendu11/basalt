import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()

test.group('Projects (functional)', () => {
  test('an admin can create a project', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const response = await client
      .post(`/organizations/${organization.id}/projects`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Marketing Site', timezone: 'Europe/Paris' })

    response.assertStatus(302)

    const project = await Project.query()
      .where('organizationId', organization.id)
      .where('name', 'Marketing Site')
      .firstOrFail()
    assert.equal(project.slug, 'marketing-site')
    assert.equal(project.timezone, 'Europe/Paris')
  })

  test('a plain member cannot create a project', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const member = await UserFactory.create()
    await OrganizationMembership.create({
      organizationId: organization.id,
      userId: member.id,
      role: 'member',
      joinedAt: organization.createdAt,
    })

    const response = await client
      .post(`/organizations/${organization.id}/projects`)
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Marketing Site', timezone: 'Europe/Paris' })

    // Bouncer redirects back (rather than a raw 403) for form-submission
    // HTTP methods — see @adonisjs/bouncer's AuthorizationException.
    response.assertStatus(302)

    const project = await Project.query()
      .where('organizationId', organization.id)
      .where('name', 'Marketing Site')
      .first()
    assert.isNull(project)
  })

  test('a project from another organization is 404, not leaked across organizations', async ({
    client,
  }) => {
    const owner = await UserFactory.create()
    const organizationA = await organizationService.create(owner, { name: 'A' })
    const organizationB = await organizationService.create(owner, { name: 'B' })

    const projectA = await projectService.create(organizationA, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    const response = await client
      .get(`/organizations/${organizationB.id}/projects/${projectA.id}`)
      .loginAs(owner)

    response.assertStatus(404)
  })

  test('a member (not admin) can view but not delete a project', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    const member = await UserFactory.create()
    await OrganizationMembership.create({
      organizationId: organization.id,
      userId: member.id,
      role: 'member',
      joinedAt: organization.createdAt,
    })

    const viewResponse = await client
      .get(`/organizations/${organization.id}/projects/${project.id}`)
      .loginAs(member)
    viewResponse.assertStatus(200)

    const deleteResponse = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}`)
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    assert.isNotNull(await Project.find(project.id))
  })

  test('an admin can delete a project', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    const response = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    assert.isNull(await Project.find(project.id))
  })

  test('creating a project with an invalid timezone is rejected', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const response = await client
      .post(`/organizations/${organization.id}/projects`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Site', timezone: 'Not/AZone' })

    // Validation failures redirect back with flashed errors, like any
    // other Inertia form submission — not a raw 422.
    response.assertStatus(302)

    const project = await Project.query().where('organizationId', organization.id).first()
    assert.isNull(project)
  })
})
