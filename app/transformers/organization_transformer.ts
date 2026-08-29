import type Organization from '#models/organization'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class OrganizationTransformer extends BaseTransformer<Organization> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'name', 'slug', 'ownerUserId', 'createdAt', 'updatedAt']),
      imageUrl: this.resource.imagePath ? `/${this.resource.imagePath}` : null,
    }
  }
}
