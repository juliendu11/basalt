import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()

test.group('Invitations (functional)', () => {
  test('a full invite -> accept flow joins the organization', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const inviteResponse = await client
      .post(`/organizations/${organization.id}/members/invitations`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'invitee@example.com', role: 'member' })
    inviteResponse.assertStatus(302)

    const invitation = await OrganizationInvitation.query()
      .where('organizationId', organization.id)
      .where('email', 'invitee@example.com')
      .firstOrFail()

    const invitee = await UserFactory.create()

    const showResponse = await client.get(`/invitations/${invitation.token}`).loginAs(invitee)
    showResponse.assertStatus(200)

    const acceptResponse = await client
      .post(`/invitations/${invitation.token}/accept`)
      .loginAs(invitee)
      .withCsrfToken()
      .redirects(0)
    acceptResponse.assertStatus(302)

    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', invitee.id)
      .firstOrFail()
    assert.equal(membership.role, 'member')

    await invitation.refresh()
    assert.isNotNull(invitation.acceptedAt)
  })

  test('a user who signs up after being invited can still accept', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const invitation = await membershipService.invite(organization, owner, {
      email: 'newcomer@example.com',
      role: 'admin',
    })

    const signupResponse = await client.post('/signup').withCsrfToken().redirects(0).json({
      fullName: 'New Comer',
      email: 'newcomer@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    signupResponse.assertStatus(302)

    const newcomer = await User.findByOrFail('email', 'newcomer@example.com')

    const acceptResponse = await client
      .post(`/invitations/${invitation.token}/accept`)
      .loginAs(newcomer)
      .withCsrfToken()
      .redirects(0)
    acceptResponse.assertStatus(302)

    // The newcomer is now a member of both their own default organization
    // (created at signup) and the organization they were invited to.
    const memberships = await OrganizationMembership.query().where('userId', newcomer.id)
    assert.lengthOf(memberships, 2)

    const invitedMembership = memberships.find((m) => m.organizationId === organization.id)
    assert.equal(invitedMembership?.role, 'admin')
  })

  test('declining an invitation does not create a membership', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'viewer',
    })

    const declineResponse = await client
      .post(`/invitations/${invitation.token}/decline`)
      .loginAs(invitee)
      .withCsrfToken()
      .redirects(0)
    declineResponse.assertStatus(302)

    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', invitee.id)
      .first()
    assert.isNull(membership)

    await invitation.refresh()
    assert.isNotNull(invitation.revokedAt)
  })

  test('a revoked invitation cannot be accepted', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })

    const revokeResponse = await client
      .delete(`/organizations/${organization.id}/members/invitations/${invitation.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    revokeResponse.assertStatus(302)

    await client.post(`/invitations/${invitation.token}/accept`).loginAs(invitee).withCsrfToken()

    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', invitee.id)
      .first()
    assert.isNull(membership)
  })

  test('a non-admin member cannot invite anyone', async ({ client, assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const member = await UserFactory.create()
    const memberInvitation = await membershipService.invite(organization, owner, {
      email: member.email,
      role: 'member',
    })
    await membershipService.accept(memberInvitation, member)

    await client
      .post(`/organizations/${organization.id}/members/invitations`)
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)
      .json({ email: 'someone-else@example.com', role: 'viewer' })

    const invitation = await OrganizationInvitation.query()
      .where('organizationId', organization.id)
      .where('email', 'someone-else@example.com')
      .first()
    assert.isNull(invitation)
  })
})
