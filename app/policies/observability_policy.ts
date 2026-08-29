import type User from '#models/user'
import type Project from '#models/project'
import OrganizationMembership from '#models/organization_membership'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { roleAtLeast, type OrganizationRole } from '#types/roles'

/**
 * Audit log / failed jobs are owner/admin only (docs/plans/20-observability-and-audit.md
 * § Permissions — "information potentiellement sensible sur l'activité
 * d'autres membres, et action technique de relance de job"). Contact
 * history is deliberately NOT gated by this policy — it uses the standard
 * project read permission (all roles including viewer), per the plan's
 * explicit distinction between the two.
 */
export default class ObservabilityPolicy extends BasePolicy {
  async #roleFor(user: User, organizationId: number): Promise<OrganizationRole | null> {
    const membership = await OrganizationMembership.query()
      .where('organizationId', organizationId)
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .first()

    return membership?.role ?? null
  }

  async viewAuditLog(user: User, project: Project): Promise<AuthorizerResponse> {
    const role = await this.#roleFor(user, project.organizationId)
    return role !== null && roleAtLeast(role, 'admin')
  }

  async viewFailedJobs(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.viewAuditLog(user, project)
  }

  async retryFailedJob(user: User, project: Project): Promise<AuthorizerResponse> {
    return this.viewAuditLog(user, project)
  }
}
