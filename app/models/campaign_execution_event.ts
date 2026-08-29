import { CampaignExecutionEventSchema } from '#database/schema'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CampaignExecution from '#models/campaign_execution'
import CampaignNode from '#models/campaign_node'

export default class CampaignExecutionEvent extends CampaignExecutionEventSchema {
  /**
   * Same mysql2 JSON-object gotcha as `CampaignNode.config` (see that
   * model's comment) — applied defensively here too even though this table
   * is append-only in practice (never updated after insert), for
   * consistency with every other JSON-object column in the codebase.
   */
  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | Record<string, unknown> | null) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare metadata: Record<string, unknown> | null

  @belongsTo(() => CampaignExecution, { foreignKey: 'campaignExecutionId' })
  declare execution: BelongsTo<typeof CampaignExecution>

  @belongsTo(() => CampaignNode, { foreignKey: 'nodeId' })
  declare node: BelongsTo<typeof CampaignNode>
}
