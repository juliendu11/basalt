import { CampaignVersionSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Campaign from '#models/campaign'
import User from '#models/user'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'

export default class CampaignVersion extends CampaignVersionSchema {
  @belongsTo(() => Campaign)
  declare campaign: BelongsTo<typeof Campaign>

  @belongsTo(() => User, { foreignKey: 'createdByUserId' })
  declare createdBy: BelongsTo<typeof User>

  @hasMany(() => CampaignNode)
  declare nodes: HasMany<typeof CampaignNode>

  @hasMany(() => CampaignEdge)
  declare edges: HasMany<typeof CampaignEdge>
}
