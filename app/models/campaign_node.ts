import { CampaignNodeSchema } from '#database/schema'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import CampaignVersion from '#models/campaign_version'
import CampaignEdge from '#models/campaign_edge'

export default class CampaignNode extends CampaignNodeSchema {
  /**
   * Overrides the generated column: on this connection, mysql2 serializes a
   * plain JS object correctly as bound JSON on INSERT, but falls back to
   * `Object.prototype.toString()` (`"[object Object]"`) on UPDATE, which
   * then fails MariaDB's `CHECK (JSON_VALID(...))` constraint on this JSON
   * column — confirmed by isolating `db.from(...).update({ config: {...} })`
   * (fails) vs the same call with a pre-`JSON.stringify`'d string
   * (succeeds). `prepare` forces the string every time; `consume` parses it
   * back (mirroring the `referencedFields` fix on `Segment`, mysql2 array
   * column binding). This bug latently affects every other JSON-object
   * column written via `.merge()/.save()` on an already-persisted row
   * elsewhere in the codebase (e.g. `Contact.customFields`,
   * `Organization.metadata`/`settings`) — none of those are exercised by an
   * existing update-path test, so it hasn't surfaced there yet; worth a
   * dedicated audit/fix pass.
   */
  @column({
    prepare: (value: Record<string, unknown>) => JSON.stringify(value),
    consume: (value: string | Record<string, unknown>) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare config: Record<string, unknown>

  @belongsTo(() => CampaignVersion)
  declare campaignVersion: BelongsTo<typeof CampaignVersion>

  @hasMany(() => CampaignEdge, { foreignKey: 'sourceNodeId' })
  declare outgoingEdges: HasMany<typeof CampaignEdge>

  @hasMany(() => CampaignEdge, { foreignKey: 'targetNodeId' })
  declare incomingEdges: HasMany<typeof CampaignEdge>
}
