import type { HttpContext } from '@adonisjs/core/http'
import Contact from '#models/contact'
import ProjectTransformer from '#transformers/project_transformer'
import ContactHistoryService from '#services/audit/contact_history_service'

const contactHistoryService = new ContactHistoryService()

/**
 * Standard project read permission — every role including `viewer`
 * (docs/plans/20-observability-and-audit.md § Permissions: "permissions
 * standard de lecture projet... pas une donnée d'audit sensible sur les
 * membres"), deliberately NOT gated by `ObservabilityPolicy` — project
 * membership itself (already enforced by `project_context_middleware`) is
 * the only gate, same pattern as `StatisticsController`.
 */
export default class ContactHistoryController {
  async index({ project, params, request, inertia }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    const page = request.input('page') ? Number(request.input('page')) : 1
    const history = await contactHistoryService.build(contact, page)

    return inertia.render('contacts/history', {
      project: ProjectTransformer.transform(project),
      contact: { id: contact.id, email: contact.email },
      history: {
        data: history.data.map((entry) => ({
          kind: entry.kind,
          occurredAt: entry.occurredAt.toISO(),
          summary: entry.summary,
          metadata: entry.metadata as any,
        })),
        page: history.page,
        hasMore: history.hasMore,
      },
    })
  }
}
