import type SmtpConnector from '#models/smtp_connector'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * Explicit allowlist via `.pick()`, never a denylist/omit — `password`/
 * `passwordEncrypted` are simply never in the list, so a newly added
 * sensitive column can't accidentally leak through this transformer
 * (docs/plans/07-smtp-connectors.md § Security considerations).
 */
export default class SmtpConnectorTransformer extends BaseTransformer<SmtpConnector> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'host',
      'port',
      'username',
      'encryption',
      'fromEmail',
      'fromName',
      'replyTo',
      'isDefault',
      'enabled',
      'dailyLimit',
      'lastTestedAt',
      'lastTestStatus',
      'createdAt',
      'updatedAt',
    ])
  }
}
