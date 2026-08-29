import { EmailSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import EmailTemplate from '#models/email_template'
import EmailLayout from '#models/email_layout'

export default class Email extends EmailSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => EmailTemplate)
  declare emailTemplate: BelongsTo<typeof EmailTemplate>

  @belongsTo(() => EmailLayout)
  declare emailLayout: BelongsTo<typeof EmailLayout>

  /** Usage: Email.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })
}
