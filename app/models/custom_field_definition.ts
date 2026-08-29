import { CustomFieldDefinitionSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'

export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date'

export default class CustomFieldDefinition extends CustomFieldDefinitionSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  /** Usage: CustomFieldDefinition.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })
}
