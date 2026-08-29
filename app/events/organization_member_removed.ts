import { BaseEvent } from '@adonisjs/core/events'
import type User from '#models/user'
import type Organization from '#models/organization'

export default class OrganizationMemberRemoved extends BaseEvent {
  constructor(
    public organization: Organization,
    public removedUserId: number,
    public actor: User
  ) {
    super()
  }
}
