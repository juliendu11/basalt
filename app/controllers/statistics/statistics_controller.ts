import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Campaign from '#models/campaign'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import ProjectTransformer from '#transformers/project_transformer'
import CampaignTransformer from '#transformers/campaign_transformer'
import StatisticsService, {
  resolvePeriod,
  type Period,
  type PeriodPreset,
} from '#services/statistics/statistics_service'

const PRESETS = new Set<PeriodPreset>(['today', 'last_7_days', 'last_30_days', 'custom'])
const MAX_CUSTOM_RANGE_DAYS = 366

const statisticsService = new StatisticsService()

/**
 * Read-only for every project role including `viewer`
 * (docs/plans/18-statistics-dashboard.md § Permissions) — no Bouncer check
 * needed here, consistent with every other read-only listing controller in
 * this codebase (project membership itself, already enforced by
 * `project_context_middleware`, is the only gate).
 */
export default class StatisticsController {
  async dashboard({ project, request, inertia }: HttpContext) {
    const period = this.#parsePeriod(request)

    const [summary, timeSeries] = await Promise.all([
      statisticsService.projectSummary(project, period),
      statisticsService.timeSeries(project, period),
    ])

    return inertia.render('dashboard/index', {
      project: ProjectTransformer.transform(project),
      period: preset(request),
      summary,
      timeSeries: timeSeries.map((row) => ({
        date: row.date.toISODate()!,
        sent: row.emailsSent,
        delivered: row.emailsDelivered,
        opened: row.emailsOpened,
        clicked: row.emailsClicked,
        bounced: row.emailsBounced,
        failed: row.emailsFailed,
        unsubscribed: row.unsubscribes,
      })),
    })
  }

  async campaign({ project, params, request, inertia }: HttpContext) {
    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const period = this.#parsePeriod(request)

    const [summary, timeSeries, nodePerformance] = await Promise.all([
      statisticsService.campaignSummary(campaign, period),
      statisticsService.campaignTimeSeries(campaign, period),
      statisticsService.campaignNodePerformance(campaign),
    ])

    return inertia.render('campaigns/statistics', {
      project: ProjectTransformer.transform(project),
      campaign: CampaignTransformer.transform(campaign),
      period: preset(request),
      summary,
      timeSeries: timeSeries.map((row) => ({
        date: row.date.toISODate()!,
        sent: row.sent,
        delivered: row.delivered,
        opened: row.opened,
        clicked: row.clicked,
        bounced: row.bounced,
        failed: row.failed,
        unsubscribed: row.unsubscribed,
      })),
      nodePerformance,
    })
  }

  async campaignNode({ project, params, inertia }: HttpContext) {
    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const nodePerformance = await statisticsService.campaignNodePerformance(campaign)
    const node = nodePerformance.find((n) => n.nodeId === Number(params.nodeId))
    if (!node) {
      return inertia.render('errors/not_found', {})
    }

    return inertia.render('campaigns/node_statistics', {
      project: ProjectTransformer.transform(project),
      campaign: CampaignTransformer.transform(campaign),
      node,
    })
  }

  #parsePeriod(request: HttpContext['request']): Period {
    const p = preset(request)

    if (p === 'custom') {
      const from = request.input('from')
      const to = request.input('to')
      if (!from || !to) {
        throw new BusinessRuleViolation('A custom period requires both "from" and "to" dates.')
      }

      const fromDate = DateTime.fromISO(from)
      const toDate = DateTime.fromISO(to)
      if (!fromDate.isValid || !toDate.isValid) {
        throw new BusinessRuleViolation('"from"/"to" must be valid ISO dates.')
      }
      if (fromDate > toDate) {
        throw new BusinessRuleViolation('"from" must not be after "to".')
      }
      if (toDate.diff(fromDate, 'days').days > MAX_CUSTOM_RANGE_DAYS) {
        throw new BusinessRuleViolation(
          `The custom period can span at most ${MAX_CUSTOM_RANGE_DAYS} days.`
        )
      }

      return { from: fromDate.toISODate()!, to: toDate.toISODate()! }
    }

    return resolvePeriod(p)
  }
}

function preset(request: HttpContext['request']): PeriodPreset {
  const raw = request.input('period', 'last_7_days')
  return PRESETS.has(raw) ? raw : 'last_7_days'
}
