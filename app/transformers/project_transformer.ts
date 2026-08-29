import type Project from '#models/project'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ProjectTransformer extends BaseTransformer<Project> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'organizationId',
        'name',
        'slug',
        'timezone',
        'defaultSenderName',
        'defaultSenderEmail',
        'createdAt',
        'updatedAt',
      ]),
      imageUrl: this.resource.imagePath ? `/${this.resource.imagePath}` : null,
    }
  }
}
