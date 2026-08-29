import { DateTime } from 'luxon'
import { OrganizationInvitationSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Organization from '#models/organization'

export default class OrganizationInvitation extends OrganizationInvitationSchema {
  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  @belongsTo(() => User, { foreignKey: 'invitedByUserId' })
  declare invitedBy: BelongsTo<typeof User>

  get isExpired(): boolean {
    return this.expiresAt < DateTime.now()
  }

  get isPending(): boolean {
    return !this.acceptedAt && !this.revokedAt && !this.isExpired
  }
}
