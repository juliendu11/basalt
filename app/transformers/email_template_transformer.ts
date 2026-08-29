import type EmailTemplate from '#models/email_template'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class EmailTemplateTransformer extends BaseTransformer<EmailTemplate> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'subject',
      'htmlContent',
      'textContent',
      'createdAt',
      'updatedAt',
    ])
  }
}
