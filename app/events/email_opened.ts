import { BaseEvent } from '@adonisjs/core/events'

/** System-triggered (dispatched by TrackingEventService, no human actor). */
export default class EmailOpened extends BaseEvent {
  constructor(
    public deliveryId: number,
    public contactId: number
  ) {
    super()
  }
}
