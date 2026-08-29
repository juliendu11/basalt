import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type ApiKey from '#models/api_key'
import ApiKeyService from '#services/api_keys/api_key_service'

const apiKeyService = new ApiKeyService()

const BEARER_PREFIX = 'Bearer '

/**
 * Authenticates `/api/v1/*` requests against `api_keys` instead of the
 * session guard used everywhere else — resolves `ctx.project` from the key
 * itself (reusing the exact `HttpContext.project: Project` augmentation
 * `project_context_middleware.ts` already declares), never from a URL param,
 * so a key can't be pointed at a project it doesn't belong to by editing the
 * request path.
 */
export default class ApiKeyAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const header = ctx.request.header('authorization')
    const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null

    const apiKey = token ? await apiKeyService.verify(token) : null

    if (!apiKey) {
      return ctx.response.status(401).send({ errors: [{ message: 'Invalid or missing API key' }] })
    }

    ctx.apiKey = apiKey
    ctx.project = apiKey.project

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    apiKey: ApiKey
  }
}
