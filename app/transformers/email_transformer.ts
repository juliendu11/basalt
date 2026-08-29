import type Email from '#models/email'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class EmailTransformer extends BaseTransformer<Email> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'emailTemplateId',
      'emailLayoutId',
      'name',
      'subject',
      'preheader',
      'senderName',
      'senderEmail',
      'replyTo',
      'htmlContent',
      'bodyContent',
      'textContent',
      'status',
      'createdAt',
      'updatedAt',
    ])
  }
}
