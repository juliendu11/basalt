import type { HttpContext } from '@adonisjs/core/http'
import CustomFieldDefinition from '#models/custom_field_definition'
import CustomFieldDefinitionPolicy from '#policies/custom_field_definition_policy'
import CustomFieldDefinitionService from '#services/custom_fields/custom_field_definition_service'
import {
  createCustomFieldDefinitionValidator,
  updateCustomFieldDefinitionValidator,
} from '#validators/custom_field_definition'
import CustomFieldDefinitionTransformer from '#transformers/custom_field_definition_transformer'
import ProjectTransformer from '#transformers/project_transformer'

const customFieldDefinitionService = new CustomFieldDefinitionService()

export default class CustomFieldDefinitionsController {
  async index({ project, inertia }: HttpContext) {
    const definitions = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('label', 'asc')

    return inertia.render('settings/custom_fields/index', {
      project: ProjectTransformer.transform(project),
      definitions: CustomFieldDefinitionTransformer.transform(definitions),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(CustomFieldDefinitionPolicy).authorize('create', project)

    return inertia.render('settings/custom_fields/create', {
      project: ProjectTransformer.transform(project),
    })
  }

  async store({ project, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(CustomFieldDefinitionPolicy).authorize('create', project)

    const payload = await request.validateUsing(createCustomFieldDefinitionValidator, {
      meta: { projectId: project.id },
    })
    await customFieldDefinitionService.create(project, payload)

    session.flash('success', 'Custom field created.')
    return response.redirect().toRoute('custom_field_definitions.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    await bouncer.with(CustomFieldDefinitionPolicy).authorize('update', project)

    const definition = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.customFieldDefinitionId)
      .first()

    if (!definition) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    return inertia.render('settings/custom_fields/edit', {
      project: ProjectTransformer.transform(project),
      definition: CustomFieldDefinitionTransformer.transform(definition),
    })
  }

  async update({ project, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(CustomFieldDefinitionPolicy).authorize('update', project)

    const definition = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.customFieldDefinitionId)
      .firstOrFail()

    const payload = await request.validateUsing(updateCustomFieldDefinitionValidator)
    await customFieldDefinitionService.update(definition, payload.label)

    session.flash('success', 'Custom field updated.')
    return response.redirect().toRoute('custom_field_definitions.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async destroy({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(CustomFieldDefinitionPolicy).authorize('destroy', project)

    const definition = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.customFieldDefinitionId)
      .firstOrFail()

    await customFieldDefinitionService.delete(definition)

    session.flash('success', 'Custom field deleted.')
    return response.redirect().toRoute('custom_field_definitions.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }
}
