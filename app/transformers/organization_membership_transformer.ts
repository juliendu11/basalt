import type OrganizationMembership from '#models/organization_membership'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'

export default class OrganizationMembershipTransformer extends BaseTransformer<OrganizationMembership> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'role', 'joinedAt', 'createdAt']),
      user: UserTransformer.transform(this.whenLoaded(this.resource.user)),
    }
  }
}
