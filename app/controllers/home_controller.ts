import type { HttpContext } from '@adonisjs/core/http'
import OrganizationMembership from '#models/organization_membership'
import Project from '#models/project'

export default class HomeController {
  /**
   * A logged-in user landing on "/" has no page of their own here — send
   * them straight to their oldest organization's oldest project dashboard
   * (docs/plans note there's no organization-level dashboard yet), falling
   * back to the relevant "create" step when either is missing.
   */
  async index({ auth, session, response }: HttpContext) {
    if (!auth.user) {
      return response.redirect().toRoute('session.create')
    }

    const membership = await OrganizationMembership.query()
      .where('userId', auth.user.id)
      .whereNotNull('joinedAt')
      .preload('organization')
      .orderBy('joinedAt', 'asc')
      .first()

    if (!membership) {
      return response.redirect().toRoute('organizations.create')
    }

    session.put('organizationId', membership.organization.id)

    const project = await Project.query()
      .withScopes((scopes) => scopes.forOrganization(membership.organization))
      .orderBy('createdAt', 'asc')
      .first()

    if (!project) {
      return response.redirect().toRoute('projects.create', {
        organizationId: membership.organization.id,
      })
    }

    session.put('projectId', project.id)

    return response.redirect().toRoute('statistics.dashboard', {
      organizationId: membership.organization.id,
      projectId: project.id,
    })
  }
}
