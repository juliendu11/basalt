import { EmailEventSchema } from '#database/schema'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import EmailDelivery from '#models/email_delivery'
import Contact from '#models/contact'

export type EmailEventType =
  'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'unsubscribed'

export default class EmailEvent extends EmailEventSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @belongsTo(() => EmailDelivery, { foreignKey: 'emailDeliveryId' })
  declare delivery: BelongsTo<typeof EmailDelivery>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>

  /** Usage: EmailEvent.query().withScopes((s) => s.ofType('opened')) */
  static ofType = scope((query, type: EmailEventType) => {
    query.where('type', type)
  })
}
