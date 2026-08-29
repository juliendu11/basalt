import { ContactUnsubscribeEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Contact from '#models/contact'
import Campaign from '#models/campaign'

export default class ContactUnsubscribeEvent extends ContactUnsubscribeEventSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>

  @belongsTo(() => Campaign)
  declare campaign: BelongsTo<typeof Campaign>
}
