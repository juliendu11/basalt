import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationService from '#services/organizations/organization_service'

const organizationService = new OrganizationService()

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
