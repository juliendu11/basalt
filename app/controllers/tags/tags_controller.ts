import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import TagPolicy from '#policies/tag_policy'
import TagService from '#services/tags/tag_service'
import { createTagValidator, updateTagValidator } from '#validators/tag'
import TagTransformer from '#transformers/tag_transformer'
import ProjectTransformer from '#transformers/project_transformer'

const tagService = new TagService()

export default class TagsController {
  async index({ project, inertia }: HttpContext) {
    const tags = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('settings/tags/index', {
      project: ProjectTransformer.transform(project),
      tags: TagTransformer.transform(tags),
    })
  }

  async store({ project, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(TagPolicy).authorize('create', project)

    const payload = await request.validateUsing(createTagValidator)
    await tagService.create(project, payload)

    session.flash('success', 'Tag created.')
    return response.redirect().toRoute('tags.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    await bouncer.with(TagPolicy).authorize('update', project)

    const tag = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.tagId)
      .first()

    if (!tag) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    return inertia.render('settings/tags/edit', {
      project: ProjectTransformer.transform(project),
      tag: TagTransformer.transform(tag),
    })
  }

  async update({ project, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(TagPolicy).authorize('update', project)

    const tag = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.tagId)
      .firstOrFail()

    const payload = await request.validateUsing(updateTagValidator)
    await tagService.update(tag, payload)

    session.flash('success', 'Tag updated.')
    return response.redirect().toRoute('tags.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async destroy({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(TagPolicy).authorize('destroy', project)

    const tag = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.tagId)
      .firstOrFail()

    await tagService.delete(tag)

    session.flash('success', 'Tag deleted.')
    return response.redirect().toRoute('tags.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }
}
