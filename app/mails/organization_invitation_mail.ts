import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type OrganizationInvitation from '#models/organization_invitation'

export default class OrganizationInvitationMail extends BaseMail {
  constructor(private invitation: OrganizationInvitation) {
    super()
  }

  async prepare() {
    await this.invitation.load('organization')
    await this.invitation.load('invitedBy')

    this.subject = `You've been invited to join ${this.invitation.organization.name}`

    const acceptUrl = `${env.get('APP_URL')}/invitations/${this.invitation.token}`

    this.message.to(this.invitation.email).htmlView('mails/organization_invitation', {
      organizationName: this.invitation.organization.name,
      inviterName: this.invitation.invitedBy.fullName ?? this.invitation.invitedBy.email,
      role: this.invitation.role,
      acceptUrl,
    })
  }
}
