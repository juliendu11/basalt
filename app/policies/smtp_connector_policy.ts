import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * Stricter than the standard project permission matrix
 * (docs/plans/07-smtp-connectors.md § Permissions): only owner/admin may
 * create/edit/delete/set-default/toggle a connector, since credentials are
 * sensitive — member/viewer are read-only, unlike ContactPolicy where
 * member can also write.
 */
export default class SmtpConnectorPolicy extends BasePolicy {
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
    return role !== null && roleAtLeast(role, 'admin')
  }

  async update(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  async destroy(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }
}
