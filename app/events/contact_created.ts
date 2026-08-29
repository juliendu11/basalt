import { BaseEvent } from '@adonisjs/core/events'
import type Contact from '#models/contact'
import type User from '#models/user'

export default class ContactCreated extends BaseEvent {
  constructor(
    public contact: Contact,
    public actor: User
  ) {
    super()
  }
}
