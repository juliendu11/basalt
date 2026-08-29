import { CampaignSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import CampaignVersion from '#models/campaign_version'

export default class Campaign extends CampaignSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @hasMany(() => CampaignVersion)
  declare versions: HasMany<typeof CampaignVersion>

  @belongsTo(() => CampaignVersion, { foreignKey: 'draftVersionId' })
  declare draftVersion: BelongsTo<typeof CampaignVersion>

  @belongsTo(() => CampaignVersion, { foreignKey: 'publishedVersionId' })
  declare publishedVersion: BelongsTo<typeof CampaignVersion>

  /** Usage: Campaign.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })

  static active = scope((query) => {
    query.where('status', 'active')
  })
}
