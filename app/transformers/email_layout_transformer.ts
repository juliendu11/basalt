import type EmailLayout from '#models/email_layout'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class EmailLayoutTransformer extends BaseTransformer<EmailLayout> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'htmlContent',
      'textContent',
      'createdAt',
      'updatedAt',
    ])
  }
}
