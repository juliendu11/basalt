import type { EmailEventType } from '#models/email_event'

export interface AdaptedWebhookEvent {
  providerMessageId: string
  type: EmailEventType
  metadata: Record<string, unknown>
}

// Maps a handful of common provider event-name spellings to this app's
// fixed `email_events.type` vocabulary. Extend this map (or add a
// provider-specific adapter file alongside this one, same directory) as
// real providers are integrated — deliberately minimal for v1
// (docs/plans/16-email-tracking.md § Open questions: "seul un
// generic_adapter minimal est détaillé en v1").
const EVENT_TYPE_MAP: Record<string, EmailEventType> = {
  delivered: 'delivered',
  delivery: 'delivered',
  bounce: 'bounced',
  bounced: 'bounced',
  hard_bounce: 'bounced',
  soft_bounce: 'bounced',
  complaint: 'complained',
  complained: 'complained',
  spam_complaint: 'complained',
}

/**
 * Best-effort translation of an unknown-shape provider webhook payload into
 * `{ providerMessageId, type, metadata }`. Returns `null` for anything
 * unrecognized — the controller responds `200 OK` regardless (per the
 * plan's explicit "rejet silencieux plutôt qu'une erreur bruyante", to
 * avoid a provider disabling the webhook after too many non-2xx
 * responses), it just does nothing further for a payload this can't
 * translate.
 */
export default class GenericSmtpWebhookAdapter {
  adapt(payload: unknown): AdaptedWebhookEvent | null {
    if (typeof payload !== 'object' || payload === null) return null

    const body = payload as Record<string, unknown>
    const messageId = body.message_id ?? body.messageId ?? body.MessageID
    const eventName = body.event ?? body.Event ?? body.event_type

    if (typeof messageId !== 'string' || messageId.length === 0) return null
    if (typeof eventName !== 'string') return null

    const lowerEventName = eventName.toLowerCase()
    const type = EVENT_TYPE_MAP[lowerEventName]
    if (!type) return null

    let bounceType: 'hard' | 'soft' | undefined
    if (lowerEventName.includes('hard')) bounceType = 'hard'
    else if (lowerEventName.includes('soft')) bounceType = 'soft'

    return {
      providerMessageId: messageId,
      type,
      metadata: bounceType ? { bounceType } : {},
    }
  }
}
