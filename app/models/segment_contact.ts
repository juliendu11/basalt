import { SegmentContactSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Segment from '#models/segment'
import Contact from '#models/contact'

export default class SegmentContact extends SegmentContactSchema {
  @belongsTo(() => Segment)
  declare segment: BelongsTo<typeof Segment>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>
}
