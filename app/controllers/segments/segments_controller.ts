import type { HttpContext } from '@adonisjs/core/http'
import Segment from '#models/segment'
import CustomFieldDefinition from '#models/custom_field_definition'
import Tag from '#models/tag'
import SegmentPolicy from '#policies/segment_policy'
import SegmentService from '#services/segments/segment_service'
import ContactQueryService from '#services/contacts/contact_query_service'
import { createSegmentValidator, updateSegmentValidator } from '#validators/segment'
import SegmentTransformer from '#transformers/segment_transformer'
import ContactTransformer from '#transformers/contact_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import CustomFieldDefinitionTransformer from '#transformers/custom_field_definition_transformer'
import TagTransformer from '#transformers/tag_transformer'
import type { SegmentDefinition } from '#types/segment_definition'
import queueDispatcher from '#services/jobs/queue_dispatcher'

const segmentService = new SegmentService()
const contactQueryService = new ContactQueryService()

export default class SegmentsController {
  async index({ project, inertia }: HttpContext) {
    const segments = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('segments/index', {
      project: ProjectTransformer.transform(project),
      segments: SegmentTransformer.transform(segments),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(SegmentPolicy).authorize('create', project)

    const customFieldDefinitions = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('label', 'asc')
    const tags = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('segments/create', {
      project: ProjectTransformer.transform(project),
      customFieldDefinitions: CustomFieldDefinitionTransformer.transform(customFieldDefinitions),
      tags: TagTransformer.transform(tags),
    })
  }

  async store({ project, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(SegmentPolicy).authorize('create', project)

    const payload = await request.validateUsing(createSegmentValidator, {
      meta: { projectId: project.id },
    })
    const segment = await segmentService.save(project, {
      name: payload.name,
      description: payload.description ?? null,
      definition: payload.definition as SegmentDefinition,
    })

    session.flash('success', 'Segment created — computing membership in the background.')
    return response.redirect().toRoute('segments.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      segmentId: segment.id,
    })
  }

  async show({ project, params, request, inertia, response, serialize }: HttpContext) {
    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.segmentId)
      .first()

    if (!segment) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    const page = await contactQueryService.paginate(project, {
      segmentId: segment.id,
      page: request.input('page') ? Number(request.input('page')) : undefined,
    })
    const contacts = await serialize(ContactTransformer.paginate(page.all(), page.getMeta()))

    return inertia.render('segments/show', {
      project: ProjectTransformer.transform(project),
      segment: SegmentTransformer.transform(segment),
      contacts,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.segmentId)
      .first()

    if (!segment) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    await bouncer.with(SegmentPolicy).authorize('update', project)

    const customFieldDefinitions = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('label', 'asc')
    const tags = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('segments/edit', {
      project: ProjectTransformer.transform(project),
      segment: SegmentTransformer.transform(segment),
      customFieldDefinitions: CustomFieldDefinitionTransformer.transform(customFieldDefinitions),
      tags: TagTransformer.transform(tags),
    })
  }

  async update({ project, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(SegmentPolicy).authorize('update', project)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.segmentId)
      .firstOrFail()

    const payload = await request.validateUsing(updateSegmentValidator, {
      meta: { projectId: project.id },
    })
    await segmentService.save(
      project,
      {
        name: payload.name,
        description: payload.description ?? null,
        definition: payload.definition as SegmentDefinition,
      },
      segment
    )

    session.flash('success', 'Segment updated — recomputing membership in the background.')
    return response.redirect().back()
  }

  async destroy({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(SegmentPolicy).authorize('destroy', project)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.segmentId)
      .firstOrFail()

    await segmentService.delete(segment)

    session.flash('success', 'Segment deleted.')
    return response.redirect().toRoute('segments.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  /** Manual "Recompute now" button (docs/plans/06-segments.md § Functional requirements). */
  async recompute({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(SegmentPolicy).authorize('update', project)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.segmentId)
      .firstOrFail()

    segment.lastComputationStatus = 'running'
    await segment.save()

    await queueDispatcher.dispatch('segments', 'segment.recompute', {
      segmentId: segment.id,
      mode: 'full',
    })

    session.flash('success', 'Recompute enqueued.')
    return response.redirect().back()
  }
}
