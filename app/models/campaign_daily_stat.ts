import { CampaignDailyStatSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Campaign from '#models/campaign'

/**
 * Pre-aggregated per-day counters for a campaign (docs/plans/18-statistics-dashboard.md
 * § Domain concepts) — an accumulator row, never recomputed on read for a
 * complete past day. `date` is a plain string (`YYYY-MM-DD`), not a Luxon
 * `DateTime`, since it's compared/grouped by day, not by instant.
 */
export default class CampaignDailyStat extends CampaignDailyStatSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => Campaign)
  declare campaign: BelongsTo<typeof Campaign>

  /** Usage: CampaignDailyStat.query().withScopes((s) => s.forDateRange(from, to)) */
  static forDateRange = scope((query, from: string, to: string) => {
    query.where('date', '>=', from).where('date', '<=', to)
  })
}
