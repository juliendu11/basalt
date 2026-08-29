import { UnsubscribeTokenSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Contact from '#models/contact'

export default class UnsubscribeToken extends UnsubscribeTokenSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>
}
