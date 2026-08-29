import type { ModelPaginatorContract } from '@adonisjs/lucid/types/model'
import type Project from '#models/project'
import AuditLog from '#models/audit_log'

export interface AuditLogFilters {
  actorUserId?: number
  action?: string
  from?: string
  to?: string
  page?: number
  perPage?: number
}

const DEFAULT_PER_PAGE = 25

/**
 * Reads `audit_logs` for the settings screen (docs/plans/20-observability-and-audit.md
 * § User flows). Scoped to the CURRENT project's organization (an
 * organization-wide view, not project-only) — `audit_logs.project_id` is
 * nullable for organization-level actions (invitations, ownership
 * transfer, ...) which a project-scoped filter would otherwise hide even
 * though they're clearly relevant to anyone administering that
 * organization. The plan's own User flows section frames this screen as
 * "le journal d'audit d'une organisation ou d'un projet" but only defines
 * ONE route, nested under the project prefix — scoping by
 * `organization_id` (derived from the current project) rather than
 * `project_id` is what actually satisfies both framings from that single
 * route: every project-level action is included (it always carries the
 * matching `organization_id` too), and organization-level actions aren't
 * silently dropped.
 */
export default class AuditLogService {
  async paginate(
    project: Project,
    filters: AuditLogFilters
  ): Promise<ModelPaginatorContract<AuditLog>> {
    const query = AuditLog.query()
      .where('organizationId', project.organizationId)
      .preload('actor')
      .orderBy('occurredAt', 'desc')

    if (filters.actorUserId) {
      query.where('actorUserId', filters.actorUserId)
    }

    if (filters.action) {
      query.where('action', filters.action)
    }

    if (filters.from) {
      query.where('occurredAt', '>=', filters.from)
    }

    if (filters.to) {
      query.where('occurredAt', '<=', filters.to)
    }

    return query.paginate(filters.page ?? 1, filters.perPage ?? DEFAULT_PER_PAGE)
  }
}
