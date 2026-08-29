import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * No contact-specific role: permissions are derived from the user's
 * organization role for the contact's project (docs/plans/19-security.md §
 * Matrice de permissions standard "projet") — owner/admin/member can
 * create/edit/delete, viewer is read-only. Authorized against `project`
 * rather than the individual `Contact` since the permission never depends
 * on the contact itself.
 */
export default class ContactPolicy extends BasePolicy {
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

  /** Standard project matrix (docs/plans/17-unsubscribe.md § Permissions). */
  async unsubscribe(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.create(user, project)
  }

  /**
   * Stricter than the standard matrix — resubscribing is a more sensitive
   * action than unsubscribing (docs/plans/17-unsubscribe.md § Permissions:
   * "restreint à owner/admin... réintroduire un contact dans le flux
   * d'envoi doit être délibéré").
   */
  async resubscribe(user: User, project: Project): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, project.organizationId)
    return role !== null && roleAtLeast(role, 'admin')
  }
}
