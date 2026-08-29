import type User from '#models/user'
import type Organization from '#models/organization'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * No project-specific role in v1 — every permission is derived from the
 * user's organization role (docs/plans/04-projects.md § Permissions).
 */
export default class ProjectPolicy extends BasePolicy {
  async #roleFor(user: User, organizationId: number): Promise<OrganizationRole | null> {
    const membership = await OrganizationMembership.query()
      .where('organizationId', organizationId)
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .first()

    return membership?.role ?? null
  }

  /** Creating a project requires at least `admin` in the organization. */
  async create(user: User, organization: Organization): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, organization.id)
    return role !== null && roleAtLeast(role, 'admin')
  }

  /** Any accepted member can view/switch onto a project. */
  async view(user: User, project: Project): Promise<AuthorizerResponse> {
    return (await this.#roleFor(user, project.organizationId)) !== null
  }

  /** Editing/deleting a project requires at least `admin`. */
  async update(user: User, project: Project): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, project.organizationId)
    return role !== null && roleAtLeast(role, 'admin')
  }

  async destroy(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.update(user, project)
  }
}
