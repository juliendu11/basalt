import { BaseEvent } from '@adonisjs/core/events'

/**
 * Dispatched by `UnsubscribeService.resubscribe()` — a manual-only action
 * (docs/plans/17-unsubscribe.md § Services). Always has an actor: unlike
 * `ContactUnsubscribed`, there is no automated/link path to resubscribing.
 */
export default class ContactResubscribed extends BaseEvent {
  constructor(
    public contactId: number,
    public projectId: number,
    public actorUserId: number
  ) {
    super()
  }
}
