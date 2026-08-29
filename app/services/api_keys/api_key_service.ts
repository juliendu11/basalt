import { createHash, randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type Project from '#models/project'
import type User from '#models/user'
import ApiKey from '#models/api_key'

const TOKEN_PREFIX = 'mtc_'

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * `api_keys` (external API authentication) — one project-scoped, revocable
 * secret per row. Unlike `DeliveryTokenService`/`UnsubscribeTokenService`,
 * this token never needs to be recovered from its stored form: it's a
 * high-entropy random secret the caller already holds, so a plain SHA-256
 * digest behind a unique index is the right lookup mechanism, not a
 * reversible signature.
 */
export default class ApiKeyService {
  /**
   * Returns the plaintext `token` alongside the created row — the plaintext
   * is never persisted or logged, and this is the only place it's ever
   * available; the caller must show it to the user exactly once.
   */
  async generate(
    project: Project,
    actor: User,
    payload: { name: string }
  ): Promise<{ apiKey: ApiKey; token: string }> {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`

    const apiKey = await ApiKey.create({
      projectId: project.id,
      name: payload.name,
      tokenHash: hash(token),
      tokenPrefix: token.slice(0, 12),
      createdBy: actor.id,
    })

    return { apiKey, token }
  }

  /** Resolves a bearer token to its (still active) `ApiKey`, or `null`. Touches `lastUsedAt` on a hit. */
  async verify(token: string): Promise<ApiKey | null> {
    const apiKey = await ApiKey.query()
      .where('tokenHash', hash(token))
      .whereNull('revokedAt')
      .preload('project')
      .preload('creator')
      .first()

    if (!apiKey) return null

    apiKey.lastUsedAt = DateTime.now()
    await apiKey.save()

    return apiKey
  }

  async revoke(apiKey: ApiKey): Promise<void> {
    apiKey.revokedAt = DateTime.now()
    await apiKey.save()
  }
}
