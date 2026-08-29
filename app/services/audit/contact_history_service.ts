import { type DateTime } from 'luxon'
import type Contact from '#models/contact'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignExecutionEvent from '#models/campaign_execution_event'
import EmailEvent from '#models/email_event'
import ContactUnsubscribeEvent from '#models/contact_unsubscribe_event'

export interface ContactHistoryEntry {
  kind: 'enrollment' | 'execution_event' | 'email_event' | 'unsubscribe_event'
  occurredAt: DateTime
  summary: string
  metadata: Record<string, unknown>
}

const PER_PAGE = 25
// Bounded per-source fetch (docs/plans/20-observability-and-audit.md § Edge
// cases: "jamais un chargement complet non paginé") — each source is
// queried for at most one page's worth PAST the requested page's end, sorted
// descending, then the four already-sorted streams are merged and re-sliced
// to the exact page window. This avoids ever loading a contact's ENTIRE
// history into memory while still producing a correctly globally-ordered
// page without a cross-table SQL UNION (four heterogeneous tables/timestamp
// columns would make a real UNION noticeably more complex for a screen this
// low-traffic).
function fetchLimit(page: number): number {
  return page * PER_PAGE
}

/**
 * Merges enrollments + campaign_execution_events (via the contact's
 * executions) + email_events + contact_unsubscribe_events into one
 * chronological, paginated timeline (docs/plans/20-observability-and-audit.md
 * § User flows — "pourquoi ce contact n'a pas reçu cet email").
 */
export default class ContactHistoryService {
  async build(
    contact: Contact,
    page: number
  ): Promise<{ data: ContactHistoryEntry[]; page: number; perPage: number; hasMore: boolean }> {
    const limit = fetchLimit(page)

    const enrollments = await CampaignEnrollment.query()
      .where('contactId', contact.id)
      .preload('campaign')
      .orderBy('enrolledAt', 'desc')
      .limit(limit)

    const executionIds = await CampaignExecution.query()
      .whereIn(
        'campaignEnrollmentId',
        enrollments.map((e) => e.id)
      )
      .select('id')

    const executionEvents =
      executionIds.length > 0
        ? await CampaignExecutionEvent.query()
            .whereIn(
              'campaignExecutionId',
              executionIds.map((e) => e.id)
            )
            .preload('node')
            .orderBy('occurredAt', 'desc')
            .limit(limit)
        : []

    const emailEvents = await EmailEvent.query()
      .where('contactId', contact.id)
      .orderBy('occurredAt', 'desc')
      .limit(limit)

    const unsubscribeEvents = await ContactUnsubscribeEvent.query()
      .where('contactId', contact.id)
      .preload('campaign')
      .orderBy('occurredAt', 'desc')
      .limit(limit)

    const entries: ContactHistoryEntry[] = [
      ...enrollments.map((e): ContactHistoryEntry => ({
        kind: 'enrollment',
        occurredAt: e.enrolledAt,
        summary: `Enrolled in "${e.campaign.name}" (${e.source})`,
        metadata: { enrollmentId: e.id, campaignId: e.campaignId, status: e.status },
      })),
      ...executionEvents.map((e): ContactHistoryEntry => ({
        kind: 'execution_event',
        occurredAt: e.occurredAt,
        summary: `${e.type}${e.node ? ` — node "${e.node.subtype}"` : ''}${e.message ? `: ${e.message}` : ''}`,
        metadata: { executionId: e.campaignExecutionId, nodeId: e.nodeId, type: e.type },
      })),
      ...emailEvents.map((e): ContactHistoryEntry => ({
        kind: 'email_event',
        occurredAt: e.occurredAt,
        summary: `Email ${e.type}`,
        metadata: { deliveryId: e.emailDeliveryId, type: e.type },
      })),
      ...unsubscribeEvents.map((e): ContactHistoryEntry => ({
        kind: 'unsubscribe_event',
        occurredAt: e.occurredAt,
        summary: `Unsubscribed (${e.source})${e.campaign ? ` from "${e.campaign.name}"` : ''}`,
        metadata: { source: e.source, campaignId: e.campaignId, reason: e.reason },
      })),
    ]

    entries.sort((a, b) => b.occurredAt.toMillis() - a.occurredAt.toMillis())

    const start = (page - 1) * PER_PAGE
    const windowed = entries.slice(start, start + PER_PAGE)

    // A cheap, honest signal rather than a full count query across four
    // tables: either the merged, already-fetched set has more rows past
    // this page, OR a source was truncated at its bounded fetch limit
    // (meaning rows beyond it were never even loaded, so `entries` alone
    // can't be trusted to know whether more exist).
    const anySourceTruncatedAtLimit =
      enrollments.length === limit ||
      executionEvents.length === limit ||
      emailEvents.length === limit ||
      unsubscribeEvents.length === limit

    return {
      data: windowed,
      page,
      perPage: PER_PAGE,
      hasMore: entries.length > start + PER_PAGE || anySourceTruncatedAtLimit,
    }
  }
}
