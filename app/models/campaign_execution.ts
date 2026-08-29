import { DateTime } from 'luxon'
import { CampaignExecutionSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignNode from '#models/campaign_node'

export default class CampaignExecution extends CampaignExecutionSchema {
  @belongsTo(() => CampaignEnrollment, { foreignKey: 'campaignEnrollmentId' })
  declare enrollment: BelongsTo<typeof CampaignEnrollment>

  @belongsTo(() => CampaignNode, { foreignKey: 'currentNodeId' })
  declare currentNode: BelongsTo<typeof CampaignNode>

  /**
   * Executions ready for the scheduler to pick up (docs/plans/12-campaign-engine.md
   * § Models) — `waiting` executions whose `scheduledAt` has passed, PLUS
   * `pending` ones (per docs/plans/13-campaign-enrollment.md § Failure
   * scenarios: an execution can be created `pending` but never get its
   * `campaign-engine.advance` job successfully enqueued, e.g. a crash
   * between the enrollment transaction commit and the enqueue call — the
   * periodic scheduler is what rescues it).
   */
  static due = scope((query) => {
    query
      .where((builder) => {
        builder
          .where('status', 'waiting')
          .where('scheduledAt', '<=', DateTime.now().toSQL({ includeOffset: false }))
      })
      .orWhere('status', 'pending')
  })

  /** Executions whose lock is held but stale (docs/plans/12-campaign-engine.md § Concurrence). */
  static stale = scope((query, thresholdMinutes: number) => {
    query
      .whereNotNull('lockedAt')
      .where(
        'lockedAt',
        '<',
        DateTime.now().minus({ minutes: thresholdMinutes }).toSQL({ includeOffset: false })
      )
  })
}
