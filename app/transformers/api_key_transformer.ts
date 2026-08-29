import type ApiKey from '#models/api_key'
import { BaseTransformer } from '@adonisjs/core/transformers'

/** `tokenHash` is deliberately never included — only `tokenPrefix` identifies a key to its owner after creation. */
export default class ApiKeyTransformer extends BaseTransformer<ApiKey> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'projectId',
      'name',
      'tokenPrefix',
      'lastUsedAt',
      'revokedAt',
      'createdAt',
    ])
  }
}
