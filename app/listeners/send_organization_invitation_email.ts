import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import type OrganizationMemberInvited from '#events/organization_member_invited'
import OrganizationInvitationMail from '#mails/organization_invitation_mail'

/**
 * A failed send must never undo the invitation itself — the token already
 * exists in the database and an admin can always share the link manually
 * (docs/plans/03-organizations.md § Failure scenarios).
 */
export default class SendOrganizationInvitationEmail {
  async handle(event: OrganizationMemberInvited) {
    try {
      await mail.send(new OrganizationInvitationMail(event.invitation))
    } catch (error) {
      logger.error(
        { err: error, invitationId: event.invitation.id },
        'Failed to send organization invitation email'
      )
    }
  }
}
