import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * Standard project permission matrix (docs/plans/10-campaigns.md §
 * Permissions, docs/plans/19-security.md) — owner/admin/member can
 * create/duplicate/activate/pause/resume/archive, viewer is read-only.
 */
export default class CampaignPolicy extends BasePolicy {
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

  async duplicate(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  /** Editing the builder canvas (docs/plans/11-campaign-builder.md § Permissions). */
  async edit(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async activate(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async pause(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async resume(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async archive(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }
}
