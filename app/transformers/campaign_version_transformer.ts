import type CampaignVersion from '#models/campaign_version'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class CampaignVersionTransformer extends BaseTransformer<CampaignVersion> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'campaignId',
      'versionNumber',
      'status',
      'graphFormatVersion',
      'publishedAt',
      'createdByUserId',
      'createdAt',
      'updatedAt',
    ])
  }
}
