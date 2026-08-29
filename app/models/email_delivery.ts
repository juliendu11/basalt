import { EmailDeliverySchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Campaign from '#models/campaign'
import CampaignExecution from '#models/campaign_execution'
import Email from '#models/email'
import Contact from '#models/contact'
import SmtpConnector from '#models/smtp_connector'

export default class EmailDelivery extends EmailDeliverySchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  /** Usage: EmailDelivery.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })

  @belongsTo(() => Campaign)
  declare campaign: BelongsTo<typeof Campaign>

  @belongsTo(() => CampaignExecution, { foreignKey: 'campaignExecutionId' })
  declare execution: BelongsTo<typeof CampaignExecution>

  @belongsTo(() => Email)
  declare email: BelongsTo<typeof Email>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>

  @belongsTo(() => SmtpConnector)
  declare smtpConnector: BelongsTo<typeof SmtpConnector>
}
