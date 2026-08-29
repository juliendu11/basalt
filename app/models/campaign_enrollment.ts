import { CampaignEnrollmentSchema } from '#database/schema'
import { belongsTo, hasOne, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import Contact from '#models/contact'
import CampaignExecution from '#models/campaign_execution'

export default class CampaignEnrollment extends CampaignEnrollmentSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => Campaign)
  declare campaign: BelongsTo<typeof Campaign>

  @belongsTo(() => CampaignVersion)
  declare campaignVersion: BelongsTo<typeof CampaignVersion>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>

  @hasOne(() => CampaignExecution)
  declare execution: HasOne<typeof CampaignExecution>

  /**
   * Usage: CampaignEnrollment.query().withScopes((s) => s.activeFor(campaign, contact))
   * (docs/plans/13-campaign-enrollment.md § Models) — not yet consumed by a
   * real enrollment service (Phase 11, not implemented in this codebase
   * yet), but the scope is a model-level concern usable now.
   */
  static activeFor = scope((query, campaign: { id: number }, contact: { id: number }) => {
    query.where('campaignId', campaign.id).where('contactId', contact.id).where('status', 'active')
  })
}
