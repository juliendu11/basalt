import type { HttpContext } from '@adonisjs/core/http'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'
import OrganizationPolicy from '#policies/organization_policy'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import { changeRoleValidator } from '#validators/organization'
import OrganizationMembershipTransformer from '#transformers/organization_membership_transformer'
import OrganizationInvitationTransformer from '#transformers/organization_invitation_transformer'
import OrganizationTransformer from '#transformers/organization_transformer'

const membershipService = new OrganizationMembershipService()

export default class OrganizationMembersController {
  async index({ organization, bouncer, inertia }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('manageMembers', organization)

    const memberships = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .whereNotNull('joinedAt')
      .preload('user')
      .orderBy('joinedAt', 'asc')

    const pendingInvitations = await OrganizationInvitation.query()
      .where('organizationId', organization.id)
      .whereNull('acceptedAt')
      .whereNull('revokedAt')
      .orderBy('createdAt', 'desc')

    return inertia.render('organizations/members/index', {
      organization: OrganizationTransformer.transform(organization),
      memberships: OrganizationMembershipTransformer.transform(memberships),
      pendingInvitations: OrganizationInvitationTransformer.transform(pendingInvitations),
    })
  }

  async update({ organization, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('manageMembers', organization)

    const membership = await OrganizationMembership.query()
      .where('id', params.membershipId)
      .where('organizationId', organization.id)
      .firstOrFail()

    const payload = await request.validateUsing(changeRoleValidator)
    await membershipService.changeRole(membership, payload.role)

    session.flash('success', 'Role updated.')
    return response.redirect().back()
  }

  async destroy({ organization, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('manageMembers', organization)

    const membership = await OrganizationMembership.query()
      .where('id', params.membershipId)
      .where('organizationId', organization.id)
      .firstOrFail()

    await membershipService.remove(membership, auth.user!)

    session.flash('success', 'Member removed.')
    return response.redirect().back()
  }
}
