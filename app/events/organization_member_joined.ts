import { BaseEvent } from '@adonisjs/core/events'
import type OrganizationMembership from '#models/organization_membership'

export default class OrganizationMemberJoined extends BaseEvent {
  constructor(public membership: OrganizationMembership) {
    super()
  }
}
