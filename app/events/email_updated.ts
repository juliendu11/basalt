import { BaseEvent } from '@adonisjs/core/events'
import type Email from '#models/email'
import type User from '#models/user'

export default class EmailUpdated extends BaseEvent {
  constructor(
    public email: Email,
    public actor: User
  ) {
    super()
  }
}
