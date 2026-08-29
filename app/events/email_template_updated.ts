import { BaseEvent } from '@adonisjs/core/events'
import type EmailTemplate from '#models/email_template'
import type User from '#models/user'

export default class EmailTemplateUpdated extends BaseEvent {
  constructor(
    public template: EmailTemplate,
    public actor: User
  ) {
    super()
  }
}
