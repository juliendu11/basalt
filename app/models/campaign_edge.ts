import { CampaignEdgeSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'

export default class CampaignEdge extends CampaignEdgeSchema {
  @belongsTo(() => CampaignVersion)
  declare campaignVersion: BelongsTo<typeof CampaignVersion>

  @belongsTo(() => CampaignNode, { foreignKey: 'sourceNodeId' })
  declare sourceNode: BelongsTo<typeof CampaignNode>

  @belongsTo(() => CampaignNode, { foreignKey: 'targetNodeId' })
  declare targetNode: BelongsTo<typeof CampaignNode>
}
