import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'
import type User from '#models/user'
import OrganizationMemberInvited from '#events/organization_member_invited'
import OrganizationMemberJoined from '#events/organization_member_joined'
import OrganizationMemberRemoved from '#events/organization_member_removed'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import type { OrganizationRole } from '#types/roles'

const INVITATION_TTL_DAYS = 7

export default class OrganizationMembershipService {
  /**
   * Creates (or refreshes, if one is already pending for that email) an
   * invitation and dispatches OrganizationMemberInvited. Never creates the
   * organization_memberships row — that only happens on acceptance
   * (docs/plans/03-organizations.md § Data model).
   */
  async invite(
    organization: Organization,
    invitedBy: User,
    payload: { email: string; role: Exclude<OrganizationRole, 'owner'> }
  ): Promise<OrganizationInvitation> {
    const existingMember = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .whereNotNull('joinedAt')
      .whereHas('user', (userQuery) => userQuery.where('email', payload.email))
      .first()

    if (existingMember) {
      throw new BusinessRuleViolation(`${payload.email} is already a member of this organization.`)
    }

    const existing = await OrganizationInvitation.query()
      .where('organizationId', organization.id)
      .where('email', payload.email)
      .whereNull('acceptedAt')
      .whereNull('revokedAt')
      .first()

    const invitation =
      existing ??
      new OrganizationInvitation().fill({ organizationId: organization.id, email: payload.email })

    invitation.role = payload.role
    invitation.invitedByUserId = invitedBy.id
    invitation.token = randomBytes(32).toString('base64url')
    invitation.expiresAt = DateTime.now().plus({ days: INVITATION_TTL_DAYS })
    await invitation.save()

    await OrganizationMemberInvited.dispatch(invitation)

    return invitation
  }

  /** Revokes a pending invitation. Idempotent: revoking twice is a no-op. */
  async revokeInvitation(invitation: OrganizationInvitation): Promise<void> {
    if (invitation.revokedAt) return

    invitation.revokedAt = DateTime.now()
    await invitation.save()
  }

  /**
   * Idempotent: accepting an invitation the user already accepted (double
   * click, stale tab) returns the existing membership rather than erroring
   * or duplicating it.
   */
  async accept(invitation: OrganizationInvitation, user: User): Promise<OrganizationMembership> {
    const existing = await OrganizationMembership.query()
      .where('organizationId', invitation.organizationId)
      .where('userId', user.id)
      .first()

    if (existing) {
      return existing
    }

    if (!invitation.isPending) {
      throw new BusinessRuleViolation('This invitation is no longer valid.')
    }

    const membership = await OrganizationMembership.create({
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      joinedAt: DateTime.now(),
    })

    invitation.acceptedAt = DateTime.now()
    await invitation.save()

    await OrganizationMemberJoined.dispatch(membership)

    return membership
  }

  async decline(invitation: OrganizationInvitation): Promise<void> {
    if (invitation.revokedAt || invitation.acceptedAt) return

    invitation.revokedAt = DateTime.now()
    await invitation.save()
  }

  /**
   * Refuses to change the role of the sole `owner` — ownership moves only
   * through OrganizationService.transferOwnership, never a plain role
   * change (docs/plans/03-organizations.md § Domain concepts).
   */
  async changeRole(
    membership: OrganizationMembership,
    newRole: Exclude<OrganizationRole, 'owner'>
  ): Promise<OrganizationMembership> {
    if (membership.role === 'owner') {
      throw new BusinessRuleViolation(
        'The organization owner’s role can only change by transferring ownership.'
      )
    }

    membership.role = newRole
    await membership.save()
    return membership
  }

  /** Refuses to remove the current owner — they must transfer ownership first. */
  async remove(membership: OrganizationMembership, actor: User): Promise<void> {
    if (membership.role === 'owner') {
      throw new BusinessRuleViolation(
        'The organization owner cannot be removed. Transfer ownership first.'
      )
    }

    const organizationId = membership.organizationId
    const removedUserId = membership.userId
    await membership.delete()

    await OrganizationMemberRemoved.dispatch(
      await Organization.findOrFail(organizationId),
      removedUserId,
      actor
    )
  }
}
