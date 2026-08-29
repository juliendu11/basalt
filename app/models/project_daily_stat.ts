import { ProjectDailyStatSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'

/**
 * Pre-aggregated per-day counters for a project (docs/plans/18-statistics-dashboard.md
 * § Domain concepts) — an accumulator row, never recomputed on read for a
 * complete past day.
 */
export default class ProjectDailyStat extends ProjectDailyStatSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  /** Usage: ProjectDailyStat.query().withScopes((s) => s.forDateRange(from, to)) */
  static forDateRange = scope((query, from: string, to: string) => {
    query.where('date', '>=', from).where('date', '<=', to)
  })
}
