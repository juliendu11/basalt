import { ProjectSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Organization from '#models/organization'

export default class Project extends ProjectSchema {
  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  /** Usage: Project.query().withScopes((s) => s.forOrganization(organization)) */
  static forOrganization = scope((query, organization: { id: number }) => {
    query.where('organizationId', organization.id)
  })
}
