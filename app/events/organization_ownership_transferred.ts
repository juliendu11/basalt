import { BaseEvent } from '@adonisjs/core/events'
import type Organization from '#models/organization'

export default class OrganizationOwnershipTransferred extends BaseEvent {
  constructor(
    public organization: Organization,
    public previousOwnerUserId: number,
    public newOwnerUserId: number
  ) {
    super()
  }
}
