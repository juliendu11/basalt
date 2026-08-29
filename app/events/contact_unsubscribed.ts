import { BaseEvent } from '@adonisjs/core/events'

/**
 * Dispatched by `UnsubscribeService.unsubscribe()` on every call, even a
 * repeat click on an already-unsubscribed contact's link
 * (docs/plans/17-unsubscribe.md § Idempotency considerations: the journal
 * — `contact_unsubscribe_events` — is never deduplicated, unlike
 * `contact.status` itself).
 */
export default class ContactUnsubscribed extends BaseEvent {
  constructor(
    public contactId: number,
    public projectId: number,
    public source: 'link' | 'manual' | 'bounce' | 'complaint' | 'api',
    public campaignId?: number
  ) {
    super()
  }
}
