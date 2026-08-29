import type Campaign from '#models/campaign'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class CampaignTransformer extends BaseTransformer<Campaign> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'description',
      'status',
      'draftVersionId',
      'publishedVersionId',
      'createdAt',
      'updatedAt',
    ])
  }
}
