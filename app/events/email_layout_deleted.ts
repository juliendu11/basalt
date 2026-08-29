import { BaseEvent } from '@adonisjs/core/events'
import type EmailLayout from '#models/email_layout'
import type User from '#models/user'

export default class EmailLayoutDeleted extends BaseEvent {
  constructor(
    public layout: EmailLayout,
    public actor: User
  ) {
    super()
  }
}
