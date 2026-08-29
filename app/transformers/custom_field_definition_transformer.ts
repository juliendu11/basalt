import type CustomFieldDefinition from '#models/custom_field_definition'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class CustomFieldDefinitionTransformer extends BaseTransformer<CustomFieldDefinition> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'key',
      'label',
      'type',
      'createdAt',
      'updatedAt',
    ])
  }
}
