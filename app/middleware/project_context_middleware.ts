import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Project from '#models/project'

/**
 * Resolves `ctx.project` from the `:projectId` route param and verifies it
 * belongs to `ctx.organization` (set by `organization_context_middleware`,
 * which must run first). Access itself is derived from the organization
 * role already checked there — no separate project membership in v1
 * (docs/plans/04-projects.md).
 *
 * Always responds 404 (never 403) when the project doesn't belong to the
 * organization in the URL, so a project's existence is never leaked to a
 * member of a different organization (docs/plans/04-projects.md § Security
 * considerations).
 */
export default class ProjectContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const projectId = Number(ctx.params.projectId)

    const project = Number.isInteger(projectId) ? await Project.find(projectId) : null

    if (!project || project.organizationId !== ctx.organization.id) {
      ctx.response.status(404)
      return ctx.inertia.render('errors/not_found', {})
    }

    ctx.project = project

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    project: Project
  }
}
