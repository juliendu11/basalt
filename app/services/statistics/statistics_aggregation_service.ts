import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Project from '#models/project'
import Campaign from '#models/campaign'
import Contact from '#models/contact'

export interface DailyCounts {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  failed: number
  unsubscribed: number
}

const EMPTY_COUNTS: DailyCounts = {
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  failed: 0,
  unsubscribed: 0,
}

/**
 * Populates `project_daily_stats`/`campaign_daily_stats` for a given
 * calendar day (docs/plans/18-statistics-dashboard.md § Backend
 * architecture) — the pre-aggregated half of the hybrid strategy consumed
 * by `StatisticsService` for every day except "today".
 *
 * Deviation from the plan's literal algorithm text, worth documenting
 * explicitly: the plan describes counting `email_deliveries`/`email_events`
 * both "GROUP BY status"/"GROUP BY type" as if an `email_events` row of
 * type `sent`/`delivered` existed for every delivery — but
 * `send_email_executor.ts` (Phase 10) and `TrackingEventService` (Phase 12)
 * never actually write such a row; `email_deliveries.status` (the pipeline
 * state) is the only place `sent`/`failed` ever land, and `delivered`/
 * `bounced` only ever appear via a real provider webhook (best-effort,
 * likely never fired against Mailcatcher in this dev/test environment).
 * `opened`/`clicked` are genuinely only ever recorded in `email_events`.
 * So: `sent`/`delivered`/`bounced`/`failed` are counted from
 * `email_deliveries.status` (bucketed by the delivery's `created_at` date
 * and its CURRENT status — an accepted approximation for a delivery whose
 * status changes on a later day than it was created, consistent with what
 * the plan's own query shape implies), while `opened`/`clicked` come from
 * `email_events`, counted `COUNT(DISTINCT email_delivery_id)` per the
 * plan's own explicit "unique clicks via DISTINCT aggregation, not raw
 * event count" edge case guidance (docs/plans/16-email-tracking.md § Edge
 * cases). `unsubscribed` comes from `contact_unsubscribe_events`, the real
 * source of truth for unsubscribes (docs/plans/17-unsubscribe.md) —
 * `email_events`' own `unsubscribed` type is never populated, that type is
 * explicitly unhandled by `TrackingEventService.processEvent`.
 */
export default class StatisticsAggregationService {
  /** Aggregates every project for `date` (typically yesterday), each project in its own short transaction. */
  async aggregateDailyStats(date: DateTime): Promise<void> {
    const dateStr = date.toISODate()!
    const projects = await Project.all()

    for (const project of projects) {
      await db.transaction(async (trx) => {
        const projectCounts = await this.projectCounts(project.id, dateStr)
        const contactsTotal = await Contact.query({ client: trx })
          .withScopes((s) => s.forProject(project))
          .count('* as total')
          .pojo<{ total: number }>()
        const contactsActive = await Contact.query({ client: trx })
          .withScopes((s) => s.forProject(project))
          .withScopes((s) => s.eligibleForSending())
          .count('* as total')
          .pojo<{ total: number }>()

        await trx.rawQuery(
          `INSERT INTO project_daily_stats
             (project_id, date, contacts_total, contacts_active, emails_sent, emails_delivered,
              emails_opened, emails_clicked, emails_bounced, emails_failed, unsubscribes,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             contacts_total = VALUES(contacts_total), contacts_active = VALUES(contacts_active),
             emails_sent = VALUES(emails_sent), emails_delivered = VALUES(emails_delivered),
             emails_opened = VALUES(emails_opened), emails_clicked = VALUES(emails_clicked),
             emails_bounced = VALUES(emails_bounced), emails_failed = VALUES(emails_failed),
             unsubscribes = VALUES(unsubscribes), updated_at = VALUES(updated_at)`,
          [
            project.id,
            dateStr,
            toCount(contactsTotal),
            toCount(contactsActive),
            projectCounts.sent,
            projectCounts.delivered,
            projectCounts.opened,
            projectCounts.clicked,
            projectCounts.bounced,
            projectCounts.failed,
            projectCounts.unsubscribed,
            now(),
            now(),
          ]
        )

        const campaigns = await Campaign.query({ client: trx }).where('projectId', project.id)
        for (const campaign of campaigns) {
          const counts = await this.campaignCounts(project.id, campaign.id, dateStr)

          await trx.rawQuery(
            `INSERT INTO campaign_daily_stats
               (project_id, campaign_id, date, sent, delivered, opened, clicked, bounced, failed,
                unsubscribed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               sent = VALUES(sent), delivered = VALUES(delivered), opened = VALUES(opened),
               clicked = VALUES(clicked), bounced = VALUES(bounced), failed = VALUES(failed),
               unsubscribed = VALUES(unsubscribed), updated_at = VALUES(updated_at)`,
            [
              project.id,
              campaign.id,
              dateStr,
              counts.sent,
              counts.delivered,
              counts.opened,
              counts.clicked,
              counts.bounced,
              counts.failed,
              counts.unsubscribed,
              now(),
              now(),
            ]
          )
        }
      })
    }
  }

  async projectCounts(projectId: number, dateStr: string): Promise<DailyCounts> {
    const deliveryStatus = await this.#deliveryStatusCounts({ project_id: projectId }, dateStr)
    const events = await this.#eventCounts({ project_id: projectId }, dateStr)
    const unsubscribed = await this.#unsubscribeCount({ project_id: projectId }, dateStr)

    return { ...EMPTY_COUNTS, ...deliveryStatus, ...events, unsubscribed }
  }

  async campaignCounts(
    projectId: number,
    campaignId: number,
    dateStr: string
  ): Promise<DailyCounts> {
    const deliveryStatus = await this.#deliveryStatusCounts(
      { project_id: projectId, campaign_id: campaignId },
      dateStr
    )
    const events = await this.#eventCounts(
      { project_id: projectId, campaign_id: campaignId },
      dateStr,
      true
    )
    const unsubscribed = await this.#unsubscribeCount(
      { project_id: projectId, campaign_id: campaignId },
      dateStr
    )

    return { ...EMPTY_COUNTS, ...deliveryStatus, ...events, unsubscribed }
  }

  async #deliveryStatusCounts(
    where: Record<string, number>,
    dateStr: string
  ): Promise<Partial<DailyCounts>> {
    const rows = await db
      .from('email_deliveries')
      .where(where)
      .whereRaw('DATE(created_at) = ?', [dateStr])
      .whereIn('status', ['sent', 'delivered', 'bounced', 'failed'])
      .groupBy('status')
      .select('status')
      .count('* as total')

    const counts: Partial<DailyCounts> = {}
    for (const row of rows) {
      const status = row.status as 'sent' | 'delivered' | 'bounced' | 'failed'
      counts[status] = toCount(row)
    }
    return counts
  }

  /**
   * `COUNT(DISTINCT email_delivery_id)` — "unique opens/clicks" per the
   * plan's explicit statistics-layer guidance, not a raw event count (a
   * recipient opening the same email 5 times counts once here).
   */
  async #eventCounts(
    where: Record<string, number>,
    dateStr: string,
    viaDelivery = false
  ): Promise<Partial<DailyCounts>> {
    const query = db
      .from('email_events')
      .whereRaw('DATE(email_events.occurred_at) = ?', [dateStr])
      .whereIn('email_events.type', ['opened', 'clicked'])
      .groupBy('email_events.type')
      .select('email_events.type')
      .countDistinct('email_events.email_delivery_id as total')

    if (viaDelivery) {
      // `email_events` has no `campaign_id` column — scope to the campaign
      // via a join on the delivery it belongs to instead.
      query
        .join('email_deliveries', 'email_deliveries.id', 'email_events.email_delivery_id')
        .where('email_deliveries.project_id', where.project_id)
        .where('email_deliveries.campaign_id', where.campaign_id)
    } else {
      query.where('email_events.project_id', where.project_id)
    }

    const rows = await query

    const counts: Partial<DailyCounts> = {}
    for (const row of rows) {
      const type = row.type as 'opened' | 'clicked'
      counts[type] = toCount(row)
    }
    return counts
  }

  async #unsubscribeCount(where: Record<string, number>, dateStr: string): Promise<number> {
    const row = await db
      .from('contact_unsubscribe_events')
      .where(where)
      .whereRaw('DATE(occurred_at) = ?', [dateStr])
      .count('* as total')
      .first()

    return toCount(row)
  }
}

function toCount(rowOrRows: unknown): number {
  const row = Array.isArray(rowOrRows) ? rowOrRows[0] : rowOrRows
  if (!row) return 0
  const value = (row as Record<string, unknown>).total
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function now(): string {
  return DateTime.now().toSQL({ includeOffset: false })!
}

export interface AggregateDailyStatsPayload {
  /** ISO date (`YYYY-MM-DD`). Omitted = yesterday, the normal nightly usage. */
  date?: string
}

/** Registered as the `statistics:statistics.aggregate_daily` job handler (start/jobs.ts). */
export async function aggregateDailyStatsJob(payload: AggregateDailyStatsPayload): Promise<void> {
  const date = payload.date ? DateTime.fromISO(payload.date) : DateTime.now().minus({ days: 1 })
  await new StatisticsAggregationService().aggregateDailyStats(date)
}
