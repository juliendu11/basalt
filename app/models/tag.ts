import { TagSchema } from '#database/schema'
import { belongsTo, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Contact from '#models/contact'

export default class Tag extends TagSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @manyToMany(() => Contact, {
    pivotTable: 'contact_tags',
    pivotTimestamps: { createdAt: true, updatedAt: false },
  })
  declare contacts: ManyToMany<typeof Contact>

  /** Usage: Tag.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })
}
