import type User from '#models/user'
import type Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

export default class OrganizationPolicy extends BasePolicy {
  async #roleFor(user: User, organization: Organization): Promise<OrganizationRole | null> {
    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .first()

    return membership?.role ?? null
  }

  /** Any accepted member can view the organization and switch onto it. */
  async view(user: User, organization: Organization): Promise<AuthorizerResponse> {
    return (await this.#roleFor(user, organization)) !== null
  }

  /** Editing name/settings requires at least `admin`. */
  async update(user: User, organization: Organization): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, organization)
    return role !== null && roleAtLeast(role, 'admin')
  }

  /** Inviting/removing members or changing a role requires at least `admin`. */
  async manageMembers(user: User, organization: Organization): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, organization)
    return role !== null && roleAtLeast(role, 'admin')
  }

  /** Only the current owner can delete the organization. */
  async destroy(user: User, organization: Organization): Promise<AuthorizerResponse> {
    return organization.ownerUserId === user.id
  }

  /** Only the current owner can transfer ownership. */
  async transferOwnership(user: User, organization: Organization): Promise<AuthorizerResponse> {
    return organization.ownerUserId === user.id
  }
}
