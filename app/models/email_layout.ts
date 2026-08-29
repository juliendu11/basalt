import { EmailLayoutSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Email from '#models/email'

export default class EmailLayout extends EmailLayoutSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @hasMany(() => Email)
  declare emails: HasMany<typeof Email>

  /** Usage: EmailLayout.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })
}
