import { BaseEvent } from '@adonisjs/core/events'
import type OrganizationInvitation from '#models/organization_invitation'

export default class OrganizationMemberInvited extends BaseEvent {
  constructor(public invitation: OrganizationInvitation) {
    super()
  }
}
