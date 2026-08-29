import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * Standard project permission matrix (docs/plans/06-segments.md §
 * Permissions, docs/plans/19-security.md) — owner/admin/member can
 * create/edit/delete, viewer is read-only. Mirrors ContactPolicy exactly.
 */
export default class SegmentPolicy extends BasePolicy {
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
