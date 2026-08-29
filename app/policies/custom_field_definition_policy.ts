import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * Same matrix as `ContactPolicy` — custom field definitions shape the
 * structure of contact data, so member/admin/owner can create/edit/delete,
 * viewer is read-only (index has no authorize call, same as SegmentsController#index).
 */
export default class CustomFieldDefinitionPolicy extends BasePolicy {
  async #roleFor(user: User, organizationId: number): Promise<OrganizationRole | null> {
    const membership = await OrganizationMembership.query()
      .where('organizationId', organizationId)
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .first()

    return membership?.role ?? null
  }

  async create(user: User, project: Project): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, project.organizationId)
    return role !== null && roleAtLeast(role, 'member')
  }

  async update(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async destroy(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }
}
