import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type Project from '#models/project'
import type Campaign from '#models/campaign'
import Contact from '#models/contact'
import CampaignNode from '#models/campaign_node'
import ProjectDailyStat from '#models/project_daily_stat'
import CampaignDailyStat from '#models/campaign_daily_stat'
import StatisticsAggregationService, {
  type DailyCounts,
} from '#services/statistics/statistics_aggregation_service'

export type PeriodPreset = 'today' | 'last_7_days' | 'last_30_days' | 'custom'

export interface Period {
  from: string
  to: string
}

export interface StatisticsSummary {
  from: string
  to: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  failed: number
  unsubscribed: number
  openRate: number
  clickRate: number
  bounceRate: number
}

export interface ProjectSummary extends StatisticsSummary {
  contactsTotal: number
  contactsActive: number
}

export interface NodePerformance {
  nodeId: number
  clientKey: string
  subject: string | null
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  failed: number
  openRate: number
  clickRate: number
}

const aggregationService = new StatisticsAggregationService()

/**
 * `period` preset -> concrete `[from, to]` ISO-date range, `to` inclusive.
 * `custom` is validated by the controller (capped at ~1 year per the plan's
 * abuse-prevention note) before reaching this service.
 */
export function resolvePeriod(preset: PeriodPreset, custom?: { from: string; to: string }): Period {
  const today = DateTime.now().toISODate()!

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'last_7_days':
      return { from: DateTime.now().minus({ days: 6 }).toISODate()!, to: today }
    case 'last_30_days':
      return { from: DateTime.now().minus({ days: 29 }).toISODate()!, to: today }
    case 'custom':
      if (!custom) throw new Error('resolvePeriod: "custom" requires a from/to range.')
      return custom
  }
}

/**
 * `StatisticsService.projectSummary`/`campaignSummary` implement the exact
 * hybrid algorithm from docs/plans/18-statistics-dashboard.md § Backend
 * architecture: complete past days are read from the pre-aggregated daily
 * tables (`StatisticsAggregationService` populates them nightly), "today"
 * (if included in the period) is computed in real time by reusing the SAME
 * counting logic the aggregation job itself uses — never a separate
 * re-implementation that could drift from what gets persisted.
 *
 * Rates are computed on the SUMMED totals (pre-aggregated + real-time),
 * never by averaging each day's own pre-computed ratio — averaging ratios
 * across days of very different volume would bias the result toward
 * low-volume days (docs/plans/18-statistics-dashboard.md § Domain
 * concepts, explicit on this point).
 */
export default class StatisticsService {
  async projectSummary(project: Project, period: Period): Promise<ProjectSummary> {
    const { pastDays, includesToday } = splitPeriod(period)

    const pastTotals = await this.#sumProjectDailyStats(project.id, pastDays)
    const todayCounts = includesToday
      ? await aggregationService.projectCounts(project.id, DateTime.now().toISODate()!)
      : emptyCounts()

    const totals = sumCounts(pastTotals.counts, todayCounts)

    // `contacts_total`/`contacts_active` are point-in-time snapshots, not
    // additive across days — the most recent value available for the
    // period (today's live count if included, else the last aggregated
    // day) is the meaningful number to show, never a sum.
    const [contactsTotal, contactsActive] = includesToday
      ? await this.#liveContactCounts(project)
      : [pastTotals.lastContactsTotal, pastTotals.lastContactsActive]

    return {
      ...period,
      ...totals,
      ...rates(totals),
      contactsTotal,
      contactsActive,
    }
  }

  async campaignSummary(campaign: Campaign, period: Period): Promise<StatisticsSummary> {
    const { pastDays, includesToday } = splitPeriod(period)

    const pastTotals = await this.#sumCampaignDailyStats(campaign.id, pastDays)
    const todayCounts = includesToday
      ? await aggregationService.campaignCounts(
          campaign.projectId,
          campaign.id,
          DateTime.now().toISODate()!
        )
      : emptyCounts()

    const totals = sumCounts(pastTotals, todayCounts)

    return { ...period, ...totals, ...rates(totals) }
  }

  /**
   * Per-`send_email`-node performance within a campaign — real-time only
   * (no daily-per-node table exists per the plan's own schema), correlating
   * each `email_deliveries` row back to the node that created it via the
   * SAME deterministic `${executionId}:${nodeId}` idempotency key already
   * used by Phase 12's `email_opened`/`email_clicked` condition evaluator.
   * Acceptable simplification given campaign node counts are small (tens,
   * not thousands) — a full campaign-lifetime scan, not date-bounded.
   */
  async campaignNodePerformance(campaign: Campaign): Promise<NodePerformance[]> {
    const statusRows = await db
      .from('email_deliveries')
      .where('campaign_id', campaign.id)
      .whereIn('status', ['sent', 'delivered', 'bounced', 'failed'])
      .select(db.raw("SUBSTRING_INDEX(idempotency_key, ':', -1) as node_id"), 'status')
      .count('* as total')
      .groupBy('node_id', 'status')

    const eventRows = await db
      .from('email_events')
      .join('email_deliveries', 'email_deliveries.id', 'email_events.email_delivery_id')
      .where('email_deliveries.campaign_id', campaign.id)
      .whereIn('email_events.type', ['opened', 'clicked'])
      .select(
        db.raw("SUBSTRING_INDEX(email_deliveries.idempotency_key, ':', -1) as node_id"),
        'email_events.type'
      )
      .countDistinct('email_events.email_delivery_id as total')
      .groupBy('node_id', 'email_events.type')

    const byNode = new Map<number, DailyCounts>()
    const touch = (nodeId: number) => {
      if (!byNode.has(nodeId)) byNode.set(nodeId, emptyCounts())
      return byNode.get(nodeId)!
    }

    for (const row of statusRows) {
      const nodeId = Number(row.node_id)
      const counts = touch(nodeId)
      counts[row.status as 'sent' | 'delivered' | 'bounced' | 'failed'] = toNumber(row.total)
    }
    for (const row of eventRows) {
      const nodeId = Number(row.node_id)
      const counts = touch(nodeId)
      counts[row.type as 'opened' | 'clicked'] = toNumber(row.total)
    }

    if (byNode.size === 0) return []

    const nodes = await CampaignNode.query().whereIn('id', [...byNode.keys()])
    const nodesById = new Map(nodes.map((n) => [n.id, n]))

    return [...byNode.entries()].map(([nodeId, counts]) => {
      const node = nodesById.get(nodeId)
      const config = node?.config as { subject?: string } | undefined
      const { openRate, clickRate } = rates(counts)

      return {
        nodeId,
        clientKey: node?.clientKey ?? '',
        subject: config?.subject ?? null,
        sent: counts.sent,
        delivered: counts.delivered,
        opened: counts.opened,
        clicked: counts.clicked,
        bounced: counts.bounced,
        failed: counts.failed,
        openRate,
        clickRate,
      }
    })
  }

  async timeSeries(project: Project, period: Period): Promise<ProjectDailyStat[]> {
    return ProjectDailyStat.query()
      .where('projectId', project.id)
      .withScopes((s) => s.forDateRange(period.from, period.to))
      .orderBy('date', 'asc')
  }

  async campaignTimeSeries(campaign: Campaign, period: Period): Promise<CampaignDailyStat[]> {
    return CampaignDailyStat.query()
      .where('campaignId', campaign.id)
      .withScopes((s) => s.forDateRange(period.from, period.to))
      .orderBy('date', 'asc')
  }

  async #sumProjectDailyStats(
    projectId: number,
    days: string[]
  ): Promise<{ counts: DailyCounts; lastContactsTotal: number; lastContactsActive: number }> {
    if (days.length === 0) {
      return { counts: emptyCounts(), lastContactsTotal: 0, lastContactsActive: 0 }
    }

    const row = await db
      .from('project_daily_stats')
      .where('project_id', projectId)
      .whereIn('date', days)
      .sum('emails_sent as sent')
      .sum('emails_delivered as delivered')
      .sum('emails_opened as opened')
      .sum('emails_clicked as clicked')
      .sum('emails_bounced as bounced')
      .sum('emails_failed as failed')
      .sum('unsubscribes as unsubscribed')
      .first()

    const last = await db
      .from('project_daily_stats')
      .where('project_id', projectId)
      .whereIn('date', days)
      .orderBy('date', 'desc')
      .select('contacts_total', 'contacts_active')
      .first()

    return {
      counts: {
        sent: toNumber(row?.sent),
        delivered: toNumber(row?.delivered),
        opened: toNumber(row?.opened),
        clicked: toNumber(row?.clicked),
        bounced: toNumber(row?.bounced),
        failed: toNumber(row?.failed),
        unsubscribed: toNumber(row?.unsubscribed),
      },
      lastContactsTotal: toNumber(last?.contacts_total),
      lastContactsActive: toNumber(last?.contacts_active),
    }
  }

  async #sumCampaignDailyStats(campaignId: number, days: string[]): Promise<DailyCounts> {
    if (days.length === 0) return emptyCounts()

    const row = await db
      .from('campaign_daily_stats')
      .where('campaign_id', campaignId)
      .whereIn('date', days)
      .sum('sent as sent')
      .sum('delivered as delivered')
      .sum('opened as opened')
      .sum('clicked as clicked')
      .sum('bounced as bounced')
      .sum('failed as failed')
      .sum('unsubscribed as unsubscribed')
      .first()

    return {
      sent: toNumber(row?.sent),
      delivered: toNumber(row?.delivered),
      opened: toNumber(row?.opened),
      clicked: toNumber(row?.clicked),
      bounced: toNumber(row?.bounced),
      failed: toNumber(row?.failed),
      unsubscribed: toNumber(row?.unsubscribed),
    }
  }

  async #liveContactCounts(project: Project): Promise<[number, number]> {
    const total = await Contact.query()
      .withScopes((s) => s.forProject(project))
      .count('* as total')
      .pojo<{ total: number }>()
    const active = await Contact.query()
      .withScopes((s) => s.forProject(project))
      .withScopes((s) => s.eligibleForSending())
      .count('* as total')
      .pojo<{ total: number }>()

    return [toNumber(firstRow(total)?.total), toNumber(firstRow(active)?.total)]
  }
}

/** Splits an inclusive `[from, to]` period into complete past days + whether "today" falls inside it. */
function splitPeriod(period: Period): { pastDays: string[]; includesToday: boolean } {
  const today = DateTime.now().toISODate()!
  const from = DateTime.fromISO(period.from)
  const to = DateTime.fromISO(period.to)

  const pastDays: string[] = []
  let cursor = from
  while (cursor <= to) {
    const iso = cursor.toISODate()!
    if (iso !== today) pastDays.push(iso)
    cursor = cursor.plus({ days: 1 })
  }

  return { pastDays, includesToday: period.from <= today && today <= period.to }
}

function emptyCounts(): DailyCounts {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, unsubscribed: 0 }
}

function sumCounts(a: DailyCounts, b: DailyCounts): DailyCounts {
  return {
    sent: a.sent + b.sent,
    delivered: a.delivered + b.delivered,
    opened: a.opened + b.opened,
    clicked: a.clicked + b.clicked,
    bounced: a.bounced + b.bounced,
    failed: a.failed + b.failed,
    unsubscribed: a.unsubscribed + b.unsubscribed,
  }
}

/** Ratios computed on summed totals, never averaged per-day — see class doc. */
function rates(counts: DailyCounts): { openRate: number; clickRate: number; bounceRate: number } {
  const sent = counts.sent + counts.delivered
  return {
    openRate: sent > 0 ? counts.opened / sent : 0,
    clickRate: sent > 0 ? counts.clicked / sent : 0,
    bounceRate: sent > 0 ? counts.bounced / sent : 0,
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  return Number(value ?? 0)
}

/** Lucid's `.count()` resolves to an array of rows (or, via a model query, sometimes a single row depending on driver) — normalize both shapes. */
function firstRow(result: unknown): Record<string, unknown> | undefined {
  return Array.isArray(result) ? result[0] : (result as Record<string, unknown> | undefined)
}
