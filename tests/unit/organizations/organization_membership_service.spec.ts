import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()

async function createOrganization() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  return { owner, organization }
}

test.group('OrganizationMembershipService.invite', () => {
  test('creates a pending invitation', async ({ assert }) => {
    const { owner, organization } = await createOrganization()

    const invitation = await membershipService.invite(organization, owner, {
      email: 'new-member@example.com',
      role: 'member',
    })

    assert.equal(invitation.email, 'new-member@example.com')
    assert.equal(invitation.role, 'member')
    assert.equal(invitation.organizationId, organization.id)
    assert.isTrue(invitation.isPending)
  })

  test('refreshes rather than duplicates an existing pending invitation', async ({ assert }) => {
    const { owner, organization } = await createOrganization()

    const first = await membershipService.invite(organization, owner, {
      email: 'new-member@example.com',
      role: 'viewer',
    })
    const second = await membershipService.invite(organization, owner, {
      email: 'new-member@example.com',
      role: 'admin',
    })

    assert.equal(first.id, second.id)
    assert.equal(second.role, 'admin')

    const invitations = await OrganizationInvitation.query()
      .where('organizationId', organization.id)
      .where('email', 'new-member@example.com')
    assert.lengthOf(invitations, 1)
  })

  test('refuses to invite an email that is already a member', async ({ assert }) => {
    const { owner, organization } = await createOrganization()

    await assert.rejects(
      () => membershipService.invite(organization, owner, { email: owner.email, role: 'admin' }),
      BusinessRuleViolation
    )
  })
})

test.group('OrganizationMembershipService.accept', () => {
  test('creates a membership and marks the invitation accepted', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })

    const membership = await membershipService.accept(invitation, invitee)

    assert.equal(membership.organizationId, organization.id)
    assert.equal(membership.userId, invitee.id)
    assert.equal(membership.role, 'member')
    assert.isNotNull(membership.joinedAt)

    await invitation.refresh()
    assert.isNotNull(invitation.acceptedAt)
  })

  test('is idempotent: accepting twice returns the same membership', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })

    const first = await membershipService.accept(invitation, invitee)
    const second = await membershipService.accept(invitation, invitee)

    assert.equal(first.id, second.id)

    const memberships = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', invitee.id)
    assert.lengthOf(memberships, 1)
  })

  test('refuses to accept a revoked invitation', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })
    await membershipService.revokeInvitation(invitation)

    await assert.rejects(() => membershipService.accept(invitation, invitee), BusinessRuleViolation)
  })

  test('refuses to accept an expired invitation', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()

    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })
    invitation.expiresAt = DateTime.now().minus({ days: 1 })
    await invitation.save()

    await assert.rejects(() => membershipService.accept(invitation, invitee), BusinessRuleViolation)
  })
})

test.group('OrganizationMembershipService.changeRole', () => {
  test('updates the role of a non-owner membership', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'viewer',
    })
    const membership = await membershipService.accept(invitation, invitee)

    await membershipService.changeRole(membership, 'admin')

    assert.equal(membership.role, 'admin')
  })

  test('refuses to change the owner’s role', async ({ assert }) => {
    const { organization } = await createOrganization()
    const ownerMembership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('role', 'owner')
      .firstOrFail()

    await assert.rejects(
      () => membershipService.changeRole(ownerMembership, 'admin'),
      BusinessRuleViolation
    )
  })
})

test.group('OrganizationMembershipService.remove', () => {
  test('removes a non-owner member', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const invitee = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: invitee.email,
      role: 'member',
    })
    const membership = await membershipService.accept(invitation, invitee)

    await membershipService.remove(membership, owner)

    const found = await OrganizationMembership.find(membership.id)
    assert.isNull(found)
  })

  test('refuses to remove the owner', async ({ assert }) => {
    const { owner, organization } = await createOrganization()
    const ownerMembership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('role', 'owner')
      .firstOrFail()

    await assert.rejects(
      () => membershipService.remove(ownerMembership, owner),
      BusinessRuleViolation
    )

    const stillThere = await OrganizationMembership.find(ownerMembership.id)
    assert.isNotNull(stillThere)
  })
})
