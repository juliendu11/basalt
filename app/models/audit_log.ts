import { AuditLogSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Organization from '#models/organization'

/**
 * Append-only log of significant user actions (docs/plans/20-observability-and-audit.md).
 * Never updated after creation — do not add an `updatedAt` column.
 */
export default class AuditLog extends AuditLogSchema {
  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
