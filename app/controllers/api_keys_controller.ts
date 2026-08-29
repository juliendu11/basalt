import type { HttpContext } from '@adonisjs/core/http'
import ApiKey from '#models/api_key'
import ProjectPolicy from '#policies/project_policy'
import ApiKeyService from '#services/api_keys/api_key_service'
import { createApiKeyValidator } from '#validators/api_key'
import ApiKeyTransformer from '#transformers/api_key_transformer'
import ProjectTransformer from '#transformers/project_transformer'

const apiKeyService = new ApiKeyService()

export default class ApiKeysController {
  async index({ project, inertia }: HttpContext) {
    const apiKeys = await ApiKey.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('createdAt', 'desc')

    return inertia.render('settings/api_keys/index', {
      project: ProjectTransformer.transform(project),
      apiKeys: ApiKeyTransformer.transform(apiKeys),
    })
  }

  /**
   * Renders the index page directly (no redirect) with the freshly-created
   * plaintext `token` as a one-off prop — the flash bag only forwards
   * `error`/`success` to the client (`inertia_middleware.ts`), so a redirect
   * would lose it; this is the only response that will ever carry it, since
   * it's never persisted.
   */
  async store({ project, request, auth, bouncer, inertia }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('update', project)

    const payload = await request.validateUsing(createApiKeyValidator)
    const { token } = await apiKeyService.generate(project, auth.user!, payload)

    const apiKeys = await ApiKey.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('createdAt', 'desc')

    return inertia.render('settings/api_keys/index', {
      project: ProjectTransformer.transform(project),
      apiKeys: ApiKeyTransformer.transform(apiKeys),
      newToken: token,
    })
  }

  async destroy({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('update', project)

    const apiKey = await ApiKey.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.apiKeyId)
      .firstOrFail()

    await apiKeyService.revoke(apiKey)

    session.flash('success', 'API key revoked.')
    return response.redirect().toRoute('api_keys.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }
}
