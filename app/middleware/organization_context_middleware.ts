import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import type { OrganizationRole } from '#types/roles'

/**
 * Resolves `ctx.organization`/`ctx.organizationRole` from the `:organizationId`
 * route param and verifies the current user has an accepted membership for
 * it. The active organization stored in session is only a navigation
 * convenience — this middleware is the actual source of authority, checked
 * on every request (docs/plans/03-organizations.md, docs/plans/19-security.md
 * § Isolation organisation/projet).
 *
 * Always responds 404 (never 403) when access is denied, so a non-member
 * can't distinguish "doesn't exist" from "exists but I can't see it".
 */
export default class OrganizationContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const organizationId = Number(ctx.params.organizationId)
    const user = ctx.auth.user!

    const organization = Number.isInteger(organizationId)
      ? await Organization.find(organizationId)
      : null

    if (!organization) {
      return this.#notFound(ctx)
    }

    const membership = await OrganizationMembership.query()
      .where('organizationId', organization.id)
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .first()

    if (!membership) {
      return this.#notFound(ctx)
    }

    ctx.organization = organization
    ctx.organizationRole = membership.role

    return next()
  }

  #notFound(ctx: HttpContext) {
    ctx.response.status(404)
    return ctx.inertia.render('errors/not_found', {})
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    organization: Organization
    organizationRole: OrganizationRole
  }
}
