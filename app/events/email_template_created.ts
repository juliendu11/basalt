import { BaseEvent } from '@adonisjs/core/events'
import type EmailTemplate from '#models/email_template'
import type User from '#models/user'

export default class EmailTemplateCreated extends BaseEvent {
  constructor(
    public template: EmailTemplate,
    public actor: User
  ) {
    super()
  }
}
