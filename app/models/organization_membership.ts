import { OrganizationMembershipSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Organization from '#models/organization'
import { ORGANIZATION_ROLES, roleAtLeast, type OrganizationRole } from '#types/roles'

export default class OrganizationMembership extends OrganizationMembershipSchema {
  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'invitedByUserId' })
  declare invitedBy: BelongsTo<typeof User>

  static withRoleAtLeast = scope((query, minimum: OrganizationRole) => {
    const roles = ORGANIZATION_ROLES.filter((role) => roleAtLeast(role, minimum))
    query.whereIn('role', roles)
  })
}
