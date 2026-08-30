import { type DateTime } from 'luxon'
import type Contact from '#models/contact'
import type Campaign from '#models/campaign'
import EmailDelivery from '#models/email_delivery'
import EmailEvent from '#models/email_event'

export interface SentEmail {
  deliveryId: number
  campaignId: number | null
  campaignName: string | null
  emailId: number | null
  subject: string | null
  status: 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced'
  sentAt: DateTime | null
  deliveredAt: DateTime | null
  openedAt: DateTime | null
  clickedAt: DateTime | null
}

export interface CampaignSentEmail extends SentEmail {
  contactId: number
  contactEmail: string
}

/** Cap so a contact with a long delivery history can't blow up the contact page. */
const MAX_CONTACT_SENT_EMAILS = 50
/** Campaign page shows an actual paginated table, so a fixed window per request. */
const CAMPAIGN_PER_PAGE = 50

/**
 * Emails a project has already sent — the past-facing counterpart of
 * `UpcomingSendsService` (`forContact` feeds the contact page's timeline,
 * `forCampaign` the "Recently sent" table on the campaign activity page).
 * Read-only, same project-membership gate as `ContactsController.show` /
 * `CampaignsController.upcoming`.
 */
export default class SentEmailsService {
  /** The contact's `MAX_CONTACT_SENT_EMAILS` most recent sends, returned oldest-first. */
  async forContact(contact: Contact): Promise<SentEmail[]> {
    const deliveries = await EmailDelivery.query()
      .where('contactId', contact.id)
      .whereNotNull('sentAt')
      .preload('campaign')
      .preload('email')
      .orderBy('sentAt', 'desc')
      .limit(MAX_CONTACT_SENT_EMAILS)

    if (deliveries.length === 0) return []

    const engagement = await this.#foldEngagement(deliveries.map((d) => d.id))

    return deliveries
      .map((d): SentEmail => this.#base(d, d.campaign?.name ?? null, engagement))
      .reverse()
  }

  /** One page of the campaign's sends across every contact, most recent first. */
  async forCampaign(
    campaign: Campaign,
    page = 1,
    perPage = CAMPAIGN_PER_PAGE
  ): Promise<{ data: CampaignSentEmail[]; page: number; perPage: number; hasMore: boolean }> {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1

    const rows = await EmailDelivery.query()
      .where('campaignId', campaign.id)
      .whereNotNull('sentAt')
      .preload('contact')
      .preload('email')
      .orderBy('sentAt', 'desc')
      .orderBy('id', 'desc')
      .offset((safePage - 1) * perPage)
      .limit(perPage + 1)

    const hasMore = rows.length > perPage
    const deliveries = hasMore ? rows.slice(0, perPage) : rows

    const engagement = await this.#foldEngagement(deliveries.map((d) => d.id))

    return {
      data: deliveries.map((d): CampaignSentEmail => ({
        ...this.#base(d, campaign.name, engagement),
        contactId: d.contactId,
        contactEmail: d.contact?.email ?? '(deleted contact)',
      })),
      page: safePage,
      perPage,
      hasMore,
    }
  }

  #base(
    d: EmailDelivery,
    campaignName: string | null,
    engagement: { openedAt: Map<number, DateTime>; clickedAt: Map<number, DateTime> }
  ): SentEmail {
    return {
      deliveryId: d.id,
      campaignId: d.campaignId,
      campaignName,
      emailId: d.emailId,
      subject: d.email?.subject ?? d.email?.name ?? null,
      status: d.status,
      sentAt: d.sentAt,
      deliveredAt: d.deliveredAt,
      openedAt: engagement.openedAt.get(d.id) ?? null,
      clickedAt: engagement.clickedAt.get(d.id) ?? null,
    }
  }

  /**
   * First open / first click per delivery, folded in from the append-only
   * event log (`EmailEvent`) rather than a column on the delivery itself —
   * multiple opens/clicks are kept, so we take the earliest of each.
   */
  async #foldEngagement(
    deliveryIds: number[]
  ): Promise<{ openedAt: Map<number, DateTime>; clickedAt: Map<number, DateTime> }> {
    const openedAt = new Map<number, DateTime>()
    const clickedAt = new Map<number, DateTime>()
    if (deliveryIds.length === 0) return { openedAt, clickedAt }

    const events = await EmailEvent.query()
      .whereIn('emailDeliveryId', deliveryIds)
      .whereIn('type', ['opened', 'clicked'])
      .orderBy('occurredAt', 'asc')

    for (const event of events) {
      const bucket = event.type === 'opened' ? openedAt : clickedAt
      if (!bucket.has(event.emailDeliveryId)) bucket.set(event.emailDeliveryId, event.occurredAt)
    }
    return { openedAt, clickedAt }
  }
}
