import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationService from '#services/organizations/organization_service'
import Project from '#models/project'
import ProjectService from '#services/projects/project_service'
import Contact from '#models/contact'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

const organizationService = new OrganizationService()
const projectService = new ProjectService()

test.group('Organizations (functional)', () => {
  test('a member can create an organization', async ({ client, assert }) => {
    const user = await UserFactory.create()

    const response = await client
      .post('/organizations')
      .loginAs(user)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Acme Inc' })

    response.assertStatus(302)

    const organization = await Organization.query().where('name', 'Acme Inc').firstOrFail()
    assert.equal(organization.ownerUserId, user.id)

    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', user.id)
      .firstOrFail()
    assert.equal(membership.role, 'owner')
  })

  test('a non-member gets a 404 on an organization they do not belong to', async ({ client }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Private Co' })

    const outsider = await UserFactory.create()

    const response = await client.get(`/organizations/${organization.id}/members`).loginAs(outsider)

    response.assertStatus(404)
  })

  test('a member can view the members page of their organization', async ({ client }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const response = await client.get(`/organizations/${organization.id}/members`).loginAs(owner)

    response.assertStatus(200)
  })

  test('only an owner can delete the organization', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const admin = await UserFactory.create()
    await OrganizationMembership.create({
      organizationId: organization.id,
      userId: admin.id,
      role: 'admin',
      joinedAt: organization.createdAt,
    })

    // Bouncer redirects back (rather than a raw 403) for form-submission
    // HTTP methods like DELETE — see @adonisjs/bouncer's AuthorizationException.
    const deniedResponse = await client
      .delete(`/organizations/${organization.id}`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)
    deniedResponse.assertStatus(302)

    const stillThere = await Organization.find(organization.id)
    assert.isNotNull(stillThere)

    const allowedResponse = await client
      .delete(`/organizations/${organization.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    allowedResponse.assertStatus(302)

    const gone = await Organization.find(organization.id)
    assert.isNull(gone)
  })

  test('signing up creates a default organization for the new user', async ({ client, assert }) => {
    const response = await client.post('/signup').withCsrfToken().redirects(0).json({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(302)

    const user = await User.findByOrFail('email', 'jane@example.com')
    const membership = await OrganizationMembership.query()
      .where('userId', user.id)
      .where('role', 'owner')
      .firstOrFail()

    assert.isNotNull(membership)
  })
})

test.group('Organizations — truncate contacts (functional)', () => {
  test('an admin can delete every contact of the organization', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, { name: 'P', timezone: 'UTC' })
    await Contact.create({ projectId: project.id, email: 'a@example.com' } as any)
    await Contact.create({ projectId: project.id, email: 'b@example.com' } as any)

    const response = await client
      .delete(`/organizations/${organization.id}/contacts`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    const remaining = await Contact.query().where('projectId', project.id)
    assert.lengthOf(remaining, 0)
    assert.isNotNull(await Project.find(project.id))

    const [[row]] = await db.rawQuery(
      "SELECT AUTO_INCREMENT AS next FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts'"
    )
    const other = await Contact.query().max('id as maxId').first()
    assert.equal(Number(row.next), Number(other?.$extras.maxId ?? 0) + 1)
  })

  test('a plain member cannot truncate contacts', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, { name: 'P', timezone: 'UTC' })
    await Contact.create({ projectId: project.id, email: 'a@example.com' } as any)
    const member = await UserFactory.create()
    await OrganizationMembership.create({
      organizationId: organization.id,
      userId: member.id,
      role: 'member',
      joinedAt: DateTime.now(),
    })

    const response = await client
      .delete(`/organizations/${organization.id}/contacts`)
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)

    // Bouncer redirects back for DELETE form submissions rather than a raw 403.
    response.assertStatus(302)
    const remaining = await Contact.query().where('projectId', project.id)
    assert.lengthOf(remaining, 1)
  })
})
