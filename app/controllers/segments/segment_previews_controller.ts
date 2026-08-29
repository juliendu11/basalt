import type { HttpContext } from '@adonisjs/core/http'
import Contact from '#models/contact'
import { toQuery } from '#services/segments/segment_evaluator'
import { loadCustomFieldTypes } from '#services/custom_fields/custom_field_definition_service'
import { previewSegmentValidator } from '#validators/segment'
import type { SegmentDefinition } from '#types/segment_definition'

const PREVIEW_TIMEOUT_MS = 3000

/**
 * Live estimated-count preview before saving, run as a plain `COUNT(*)`,
 * never writing to `segment_contacts` (docs/plans/06-segments.md § User
 * flows) — bounded by a short timeout so a pathological/expensive
 * definition can't hang the request; it degrades to a friendly message
 * instead ("save for background computation").
 */
export default class SegmentPreviewsController {
  async store({ project, request, response }: HttpContext) {
    const payload = await request.validateUsing(previewSegmentValidator, {
      meta: { projectId: project.id },
    })

    const query = Contact.query().withScopes((scopes) => scopes.forProject(project))
    const customFieldTypes = await loadCustomFieldTypes(project.id)
    toQuery(payload.definition as SegmentDefinition, query, customFieldTypes)

    try {
      const page = await Promise.race([
        query.paginate(1, 1),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Segment preview timed out')), PREVIEW_TIMEOUT_MS)
        }),
      ])

      return response.json({ count: Number(page.getMeta().total) })
    } catch {
      return response.json({
        count: null,
        message:
          'Preview unavailable for a definition this complex — save the segment to compute it in the background.',
      })
    }
  }
}
