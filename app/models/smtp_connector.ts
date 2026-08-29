import { SmtpConnectorSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'

export default class SmtpConnector extends SmtpConnectorSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  /** Usage: SmtpConnector.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })

  static enabled = scope((query) => {
    query.where('enabled', true)
  })

  static default = scope((query) => {
    query.where('isDefault', true)
  })
}
