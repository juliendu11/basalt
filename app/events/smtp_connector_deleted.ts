import { BaseEvent } from '@adonisjs/core/events'
import type SmtpConnector from '#models/smtp_connector'
import type User from '#models/user'

export default class SmtpConnectorDeleted extends BaseEvent {
  constructor(
    public connector: SmtpConnector,
    public actor: User
  ) {
    super()
  }
}
