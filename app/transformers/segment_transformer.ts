import type Segment from '#models/segment'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class SegmentTransformer extends BaseTransformer<Segment> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'description',
      'definition',
      'referencedFields',
      'contactCountCache',
      'lastComputedAt',
      'lastComputationStatus',
      'createdAt',
      'updatedAt',
    ])
  }
}
