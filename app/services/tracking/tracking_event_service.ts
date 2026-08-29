import { DateTime } from 'luxon'
import type { Job } from 'bullmq'
import db from '@adonisjs/lucid/services/db'
import EmailDelivery from '#models/email_delivery'
import EmailEvent, { type EmailEventType } from '#models/email_event'
import Contact from '#models/contact'
import ContactService from '#services/contacts/contact_service'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import EmailOpened from '#events/email_opened'
import EmailClicked from '#events/email_clicked'
import EmailDelivered from '#events/email_delivered'
import EmailBounced from '#events/email_bounced'
import EmailComplained from '#events/email_complained'

const DELIVERY_TERMINAL_STATUS_TYPES = new Set(['delivered', 'bounced', 'failed'])

export interface ProcessEventPayload {
  deliveryId: number
  type: EmailEventType
  metadata?: Record<string, unknown>
}

const contactService = new ContactService()

/**
 * `processEvent()` — the 5-step algorithm from
 * docs/plans/16-email-tracking.md § Backend architecture. Runs entirely
 * from the async `tracking.process_event` job, never from the public
 * `/track/*`/`/webhooks/*` request cycle itself (those only enqueue) — so
 * this never throws for an external-actor-triggered condition (unknown
 * delivery, an already-terminal contact status transition, ...); it logs
 * and no-ops instead, since surfacing an exception here would only ever be
 * visible to the job's own retry mechanism, not to whoever actually
 * triggered the event.
 */
export default class TrackingEventService {
  async processEvent(payload: ProcessEventPayload): Promise<void> {
    const delivery = await EmailDelivery.find(payload.deliveryId)
    if (!delivery) return // unknown/stale delivery id — silent no-op, never visible externally

    // Step 2: append-only, always recorded, even a repeated 'opened'
    // (docs/plans/16-email-tracking.md § Domain concepts — never
    // deduplicated, multiple opens/clicks are meaningful engagement data).
    await EmailEvent.create({
      projectId: delivery.projectId,
      emailDeliveryId: delivery.id,
      contactId: delivery.contactId,
      type: payload.type,
      metadata: payload.metadata ?? null,
      occurredAt: DateTime.now(),
    })

    // Step 3: delivery pipeline status — conditioned on not already being
    // terminal, so a late/duplicate provider notification can never
    // regress a delivery that already resolved (e.g. a 'delivered' arriving
    // after a 'bounced' must not un-bounce it).
    if (DELIVERY_TERMINAL_STATUS_TYPES.has(payload.type)) {
      const updates: Record<string, unknown> = { status: payload.type }
      if (payload.type === 'delivered') {
        updates.delivered_at = DateTime.now().toSQL({ includeOffset: false })
      }

      await db
        .from('email_deliveries')
        .where('id', delivery.id)
        .whereNotIn('status', ['bounced', 'failed'])
        .update(updates)
    }

    // Step 4: hard bounce / complaint affects the contact's own eligibility
    // going forward — a soft bounce is just a journaled event with no
    // consequence (docs/plans/16-email-tracking.md § Edge cases: default to
    // 'soft' if the adapter didn't specify, the conservative choice that
    // never blocks a contact on ambiguous data).
    if (payload.type === 'bounced') {
      const bounceType = payload.metadata?.bounceType === 'hard' ? 'hard' : 'soft'
      if (bounceType === 'hard') {
        await this.#changeContactStatus(delivery.contactId, 'bounced')
      }
      await EmailBounced.dispatch(delivery.id, delivery.contactId, bounceType)
      return
    }

    if (payload.type === 'complained') {
      await this.#changeContactStatus(delivery.contactId, 'complained')
      await EmailComplained.dispatch(delivery.id, delivery.contactId)
      return
    }

    // Step 5: 'unsubscribed' is recorded above (step 2) but its actual
    // unsubscribe logic is explicitly out of scope here — deferred to
    // docs/plans/17-unsubscribe.md (ContactUnsubscribeService), not yet
    // implemented in this codebase (docs/plans/16-email-tracking.md § Backend
    // architecture: "ce plan ne fait qu'enregistrer l'event").
    if (payload.type === 'unsubscribed') return

    if (payload.type === 'opened') {
      await EmailOpened.dispatch(delivery.id, delivery.contactId)
      return
    }

    if (payload.type === 'clicked') {
      const url = typeof payload.metadata?.url === 'string' ? payload.metadata.url : null
      await EmailClicked.dispatch(delivery.id, delivery.contactId, url)
      return
    }

    if (payload.type === 'delivered') {
      await EmailDelivered.dispatch(delivery.id, delivery.contactId)
    }

    // 'sent'/'failed': already covered by step 3's status update above,
    // no dedicated domain event for these two (send-side outcomes are
    // already observable via `email_deliveries.status` and the campaign
    // engine's own `CampaignExecutionFailed`, docs/plans/12-campaign-engine.md).
  }

  /**
   * Best-effort: an invalid state transition (e.g. a bounce notification
   * for a contact already `unsubscribed`, whose state machine — Contact's,
   * docs/plans/05-contacts.md — doesn't permit `unsubscribed -> bounced`)
   * must never crash a tracking job triggered by an external provider.
   */
  async #changeContactStatus(contactId: number, status: 'bounced' | 'complained'): Promise<void> {
    const contact = await Contact.find(contactId)
    if (!contact) return

    try {
      await contactService.changeStatus(contact, status)
    } catch (error) {
      if (!(error instanceof BusinessRuleViolation)) throw error
      // Not a valid transition from the contact's current status — no-op.
    }
  }
}

/** Registered as the `tracking:tracking.process_event` handler (start/jobs.ts). */
export async function processTrackingEventJob(
  payload: ProcessEventPayload,
  _job: Job<ProcessEventPayload>
): Promise<void> {
  const service = new TrackingEventService()
  await service.processEvent(payload)
}
