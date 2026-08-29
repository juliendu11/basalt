import type { HttpContext } from '@adonisjs/core/http'
import OrganizationInvitation from '#models/organization_invitation'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import OrganizationInvitationTransformer from '#transformers/organization_invitation_transformer'

const membershipService = new OrganizationMembershipService()

export default class InvitationsController {
  async show({ params, inertia }: HttpContext) {
    const invitation = await OrganizationInvitation.query()
      .where('token', params.token)
      .preload('organization')
      .preload('invitedBy')
      .first()

    return inertia.render('invitations/show', {
      token: params.token,
      invitation: invitation ? OrganizationInvitationTransformer.transform(invitation) : null,
    })
  }

  async accept({ params, auth, response, session }: HttpContext) {
    const invitation = await OrganizationInvitation.query().where('token', params.token).first()

    if (invitation) {
      const membership = await membershipService.accept(invitation, auth.user!)
      session.put('organizationId', membership.organizationId)
      session.flash('success', 'You joined the organization.')
      return response.redirect().toRoute('organization_members.index', {
        organizationId: membership.organizationId,
      })
    }

    session.flash('error', 'This invitation link is invalid.')
    return response.redirect().toRoute('organizations.index')
  }

  async decline({ params, response, session }: HttpContext) {
    const invitation = await OrganizationInvitation.query().where('token', params.token).first()

    if (invitation) {
      await membershipService.decline(invitation)
      session.flash('success', 'Invitation declined.')
    }

    return response.redirect().toRoute('organizations.index')
  }
}
