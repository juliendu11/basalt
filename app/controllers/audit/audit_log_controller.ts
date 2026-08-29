import type { HttpContext } from '@adonisjs/core/http'
import ObservabilityPolicy from '#policies/observability_policy'
import ProjectTransformer from '#transformers/project_transformer'
import AuditLogTransformer from '#transformers/audit_log_transformer'
import AuditLogService from '#services/audit/audit_log_service'

const auditLogService = new AuditLogService()

export default class AuditLogController {
  async index({ project, request, bouncer, inertia, serialize }: HttpContext) {
    await bouncer.with(ObservabilityPolicy).authorize('viewAuditLog', project)

    const filters = {
      actorUserId: request.input('actorUserId') ? Number(request.input('actorUserId')) : undefined,
      action: request.input('action') || undefined,
      from: request.input('from') || undefined,
      to: request.input('to') || undefined,
      page: request.input('page') ? Number(request.input('page')) : undefined,
    }

    const page = await auditLogService.paginate(project, filters)
    const logs = await serialize(AuditLogTransformer.paginate(page.all(), page.getMeta()))

    return inertia.render('settings/audit_log/index', {
      project: ProjectTransformer.transform(project),
      logs,
      filters: {
        actorUserId: filters.actorUserId ?? null,
        action: filters.action ?? null,
        from: filters.from ?? null,
        to: filters.to ?? null,
      },
    })
  }
}
