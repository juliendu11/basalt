import type { HttpContext } from '@adonisjs/core/http'
import Project from '#models/project'
import UnsubscribeTokenService from '#services/unsubscribe/unsubscribe_token_service'
import UnsubscribeService from '#services/unsubscribe/unsubscribe_service'

const unsubscribeTokenService = new UnsubscribeTokenService()
const unsubscribeService = new UnsubscribeService()

/**
 * PUBLIC route (docs/plans/17-unsubscribe.md § Routes) — no session, no
 * organization/project context; entirely token-driven, same treatment as
 * `TrackingController` (docs/plans/16-email-tracking.md).
 */
export default class UnsubscribeController {
  /**
   * GET is side-effect free (docs/security-audit-2026-10-06.md § 6): mail
   * scanners, link prefetchers and proxies follow GET links, so it only
   * renders a confirmation button. The actual unsubscribe is `confirm()`
   * (POST). An unknown/invalid token renders the SAME generic shape rather
   * than a 404/500, so a response difference can never reveal whether a
   * token is valid (§ Security considerations).
   */
  async show({ params, inertia }: HttpContext) {
    const contact = await unsubscribeTokenService.peek(params.token)

    if (!contact) {
      return inertia.render('unsubscribe/show', {
        state: 'invalid',
        projectName: null,
        token: null,
      })
    }

    const project = await Project.query().where('id', contact.projectId).firstOrFail()
    return inertia.render('unsubscribe/show', {
      state: 'confirm',
      projectName: project.name,
      token: params.token,
    })
  }

  async confirm({ params, inertia }: HttpContext) {
    const contact = await unsubscribeTokenService.resolve(params.token)

    if (!contact) {
      return inertia.render('unsubscribe/show', {
        state: 'invalid',
        projectName: null,
        token: null,
      })
    }

    const project = await Project.query().where('id', contact.projectId).firstOrFail()
    await unsubscribeService.unsubscribe(contact, 'link')

    return inertia.render('unsubscribe/show', {
      state: 'done',
      projectName: project.name,
      token: null,
    })
  }
}
