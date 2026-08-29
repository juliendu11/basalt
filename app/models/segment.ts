import { SegmentSchema } from '#database/schema'
import { belongsTo, column, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Contact from '#models/contact'
import type { SegmentDefinition } from '#types/segment_definition'

export default class Segment extends SegmentSchema {
  /**
   * Overrides the generated column: on this connection, mysql2 serializes a
   * plain JS object correctly as bound JSON on INSERT, but falls back to
   * `Object.prototype.toString()` (`"[object Object]"`) on UPDATE — so
   * editing a segment's conditions and saving silently persisted garbage
   * (or a no-op), same root cause as `CampaignNode.config` and the
   * `referencedFields` array fix below. `prepare` forces the JSON string
   * every time; `consume` parses it back (guarding the case where MySQL's
   * own JSON handling already parsed it).
   */
  @column({
    prepare: (value: SegmentDefinition) => JSON.stringify(value),
    consume: (value: string | SegmentDefinition) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare definition: SegmentDefinition

  /**
   * Overrides the generated column: mysql2 treats a bound JS `Array` value
   * as a SQL value-list (the same mechanism it uses for `IN (?)`) rather
   * than a single JSON value — inserting/updating this column with a raw
   * array silently drops every element for `[]` and corrupts the query for
   * a non-empty array. `prepare` JSON-encodes it before it reaches the
   * driver; `consume` decodes it back (guarding for the case where MySQL's
   * own JSON handling already parsed it, since it's a genuine JSON column).
   */
  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string | string[]) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare referencedFields: string[]

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @manyToMany(() => Contact, {
    pivotTable: 'segment_contacts',
    pivotTimestamps: { createdAt: 'added_at', updatedAt: false },
  })
  declare contacts: ManyToMany<typeof Contact>

  /** Usage: Segment.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })
}
