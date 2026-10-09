import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationInvitation from '#models/organization_invitation'
import OrganizationPolicy from '#policies/organization_policy'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import { inviteMemberValidator } from '#validators/organization'

@inject()
export default class OrganizationInvitationsController {
  constructor(protected membershipService: OrganizationMembershipService) {}

  async store({ organization, auth, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('manageMembers', organization)

    const payload = await request.validateUsing(inviteMemberValidator)
    await this.membershipService.invite(organization, auth.user!, payload)

    session.flash('success', `Invitation sent to ${payload.email}.`)
    return response.redirect().back()
  }

  async destroy({ organization, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('manageMembers', organization)

    const invitation = await OrganizationInvitation.query()
      .where('id', params.invitationId)
      .where('organizationId', organization.id)
      .firstOrFail()

    await this.membershipService.revokeInvitation(invitation)

    session.flash('success', 'Invitation revoked.')
    return response.redirect().back()
  }
}
