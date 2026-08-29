import { OrganizationSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvitation from '#models/organization_invitation'

export default class Organization extends OrganizationSchema {
  @belongsTo(() => User, { foreignKey: 'ownerUserId' })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => OrganizationMembership)
  declare memberships: HasMany<typeof OrganizationMembership>

  @hasMany(() => OrganizationInvitation)
  declare invitations: HasMany<typeof OrganizationInvitation>

  /**
   * Organizations the given user is an accepted member of (docs/plans/03-organizations.md).
   * Usage: Organization.query().withScopes((s) => s.forUser(user))
   *
   * Implemented with a raw `whereExists` (rather than `whereHas('memberships', ...)`)
   * to sidestep a TypeScript circularity: `scope()` needs the model's own type to
   * resolve relation names, which isn't available yet while still inside that
   * model's class body.
   */
  static forUser = scope((query, user: { id: number }) => {
    query.whereExists((subquery) => {
      subquery
        .from('organization_memberships')
        .whereColumn('organization_memberships.organization_id', 'organizations.id')
        .where('organization_memberships.user_id', user.id)
        .whereNotNull('organization_memberships.joined_at')
    })
  })
}
