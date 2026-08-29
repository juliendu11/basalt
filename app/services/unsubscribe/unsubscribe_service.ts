import { DateTime } from 'luxon'
import env from '#start/env'
import type Contact from '#models/contact'
import type Project from '#models/project'
import ContactUnsubscribeEvent from '#models/contact_unsubscribe_event'
import ContactService from '#services/contacts/contact_service'
import UnsubscribeTokenService from '#services/unsubscribe/unsubscribe_token_service'
import ContactUnsubscribed from '#events/contact_unsubscribed'
import ContactResubscribed from '#events/contact_resubscribed'

export type UnsubscribeSource = 'link' | 'manual' | 'bounce' | 'complaint' | 'api'

export interface UnsubscribeOptions {
  actorUserId?: number
  campaignId?: number
  reason?: string
}

const contactService = new ContactService()
const unsubscribeTokenService = new UnsubscribeTokenService()

/**
 * docs/plans/17-unsubscribe.md § Services. `unsubscribe()`/`resubscribe()`
 * are the only writers of `contacts.status` transitions to/from
 * `unsubscribed` — every caller (the public link, the manual contact-page
 * action, and eventually bounce/complaint processing from
 * docs/plans/16-email-tracking.md) goes through here rather than calling
 * `ContactService.changeStatus()` directly, so the journal write and the
 * status change never drift apart.
 */
export default class UnsubscribeService {
  /**
   * Idempotent on `contact.status` (a repeat call when already
   * `unsubscribed` changes nothing) but NEVER on the journal — every call
   * writes a new `contact_unsubscribe_events` row, including a repeat click
   * on an old email's link (docs/plans/17-unsubscribe.md § Idempotency
   * considerations: it's an audit journal of occurrences, not a state).
   */
  async unsubscribe(
    contact: Contact,
    source: UnsubscribeSource,
    options: UnsubscribeOptions = {}
  ): Promise<Contact> {
    if (contact.status !== 'unsubscribed') {
      contact = await contactService.changeStatus(contact, 'unsubscribed')
    }

    await ContactUnsubscribeEvent.create({
      projectId: contact.projectId,
      contactId: contact.id,
      campaignId: options.campaignId ?? null,
      source,
      reason: options.reason ?? null,
      occurredAt: DateTime.now(),
    })

    await ContactUnsubscribed.dispatch(contact.id, contact.projectId, source, options.campaignId)

    return contact
  }

  /**
   * Manual-only (docs/plans/17-unsubscribe.md § Domain concepts: "action
   * manuelle uniquement, jamais automatique"). No matching row is written
   * to `contact_unsubscribe_events` — its `source` enum
   * (`link|manual|bounce|complaint|api`) has no value that means
   * "resubscribed", and the plan itself leaves this unresolved ("à
   * préciser en implémentation"). Resolved here by relying on
   * `ContactResubscribed` → the general `audit_logs` trail
   * (docs/plans/20-observability-and-audit.md) instead of forcing this
   * event into a table whose fixed vocabulary doesn't fit it — consistent
   * with how every other "significant action" in this codebase (org/project
   * lifecycle, campaign lifecycle) is audited via `audit_logs` alone,
   * without a dedicated per-domain journal unless one already exists for a
   * different (much higher-volume) reason, as `contact_unsubscribe_events`
   * does for the unsubscribe side.
   */
  async resubscribe(contact: Contact, actorUserId: number): Promise<Contact> {
    const updated = await contactService.changeStatus(contact, 'subscribed')

    await ContactResubscribed.dispatch(updated.id, updated.projectId, actorUserId)

    return updated
  }

  /** `${APP_URL}/unsubscribe/${token}` — the value substituted for `{{ unsubscribe_url }}`. */
  async urlFor(project: Project, contact: Contact): Promise<string> {
    const token = await unsubscribeTokenService.getOrCreate(project, contact)
    return `${env.get('APP_URL')}/unsubscribe/${token.token}`
  }
}
