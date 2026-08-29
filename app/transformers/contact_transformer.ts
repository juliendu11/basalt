import type Contact from '#models/contact'
import { BaseTransformer } from '@adonisjs/core/transformers'
import TagTransformer from '#transformers/tag_transformer'

export default class ContactTransformer extends BaseTransformer<Contact> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'projectId',
        'email',
        'firstName',
        'lastName',
        'phone',
        'company',
        'country',
        'city',
        'language',
        'timezone',
        'status',
        'customFields',
        'createdAt',
        'updatedAt',
      ]),
      tags: TagTransformer.transform(this.whenLoaded(this.resource.tags)),
    }
  }
}
