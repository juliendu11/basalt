import { BaseEvent } from '@adonisjs/core/events'
import type Contact from '#models/contact'
import type User from '#models/user'

/**
 * `changedFields` lists which columns were modified — used by segment
 * recalculation (docs/plans/06-segments.md) to target only the segments
 * whose definitions reference an affected field.
 */
export default class ContactUpdated extends BaseEvent {
  constructor(
    public contact: Contact,
    public actor: User,
    public changedFields: string[]
  ) {
    super()
  }
}
