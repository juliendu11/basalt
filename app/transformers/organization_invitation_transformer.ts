import type OrganizationInvitation from '#models/organization_invitation'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'
import OrganizationTransformer from '#transformers/organization_transformer'

export default class OrganizationInvitationTransformer extends BaseTransformer<OrganizationInvitation> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'email', 'role', 'expiresAt', 'createdAt']),
      isExpired: this.resource.isExpired,
      isPending: this.resource.isPending,
      organization: OrganizationTransformer.transform(this.whenLoaded(this.resource.organization)),
      invitedBy: UserTransformer.transform(this.whenLoaded(this.resource.invitedBy)),
    }
  }
}
