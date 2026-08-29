import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import UnsubscribeToken from '#models/unsubscribe_token'
import Contact from '#models/contact'
import type Project from '#models/project'

/** mysql2 duplicate-key errors carry `code: 'ER_DUP_ENTRY'` (errno 1062). */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  )
}

/**
 * `unsubscribe_tokens` (docs/plans/17-unsubscribe.md § Domain concepts) — a
 * contact has exactly one stable, never-expiring token per project, reused
 * across every email sent, never one-per-send.
 */
export default class UnsubscribeTokenService {
  /**
   * Reuses an existing token if one already exists for this (project,
   * contact), otherwise creates one. Two near-simultaneous first-ever sends
   * to the same contact both racing to create a token is handled by the
   * `UNIQUE (project_id, contact_id)` constraint: on conflict, re-select and
   * return the row the OTHER call just inserted rather than erroring — the
   * same "insert, fall back to existing on conflict" discipline as
   * `IdempotentOperation` (docs/plans/15-retry-and-idempotency.md), applied
   * here without needing that helper's full generality (no side effect to
   * reserve against, just a row to get-or-create).
   */
  async getOrCreate(project: Project, contact: Contact): Promise<UnsubscribeToken> {
    const existing = await UnsubscribeToken.query()
      .where('projectId', project.id)
      .where('contactId', contact.id)
      .first()
    if (existing) return existing

    try {
      return await UnsubscribeToken.create({
        projectId: project.id,
        contactId: contact.id,
        token: randomBytes(32).toString('base64url'),
        createdAt: DateTime.now(),
      })
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error

      return await UnsubscribeToken.query()
        .where('projectId', project.id)
        .where('contactId', contact.id)
        .firstOrFail()
    }
  }

  /**
   * Resolves a token to its `Contact` — never throws for an unknown token
   * (docs/plans/17-unsubscribe.md § Services: "jamais d'erreur levée pour
   * un token inconnu"), the caller treats `null` as the generic
   * link-no-longer-valid case.
   */
  async resolve(token: string): Promise<Contact | null> {
    const record = await UnsubscribeToken.query().where('token', token).first()
    if (!record) return null

    record.usedAt = DateTime.now()
    await record.save()

    return Contact.query().where('id', record.contactId).first()
  }
}
