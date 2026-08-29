import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

const DEFAULT_STALENESS_MINUTES = 5

export interface ReserveOptions {
  /** Table to reserve a row in (e.g. `email_deliveries`). */
  table: string
  /** The deterministic idempotency key for this operation — never random. */
  idempotencyKey: string
  /** Column holding the idempotency key (default `idempotency_key`). */
  keyColumn?: string
  /** Full row to insert on first attempt — MUST include `keyColumn` and an in-flight status. */
  insertRow: Record<string, unknown>
  /** The status value `insertRow` uses to mean "in flight" (e.g. `processing`). */
  inFlightStatus: string
  /** Status values that mean "the side effect already ran to some conclusion" (e.g. `['sent', 'failed']`). */
  terminalStatuses: string[]
  /** Column tracking reservation freshness for staleness detection (default `updated_at`). */
  staleColumn?: string
  stalenessMinutes?: number
}

export type ReservationOutcome =
  | { action: 'proceed'; rowId: number; resumed: boolean }
  | { action: 'skip'; rowId: number; reason: 'terminal' | 'in_flight' }

/**
 * Generic reservation helper implementing the reserve-before-side-effect
 * pattern from docs/plans/15-retry-and-idempotency.md § Domain concepts
 * (generalizing decisions/ADR-005-email-idempotency.md) — the mechanism
 * that lets a crashed-and-retried job avoid a duplicate side effect
 * (double email send being the critical case) without ever trusting
 * "check-then-act" (a classic TOCTOU race), by making the RESERVATION
 * itself an atomic, uniquely-constrained INSERT.
 *
 * Deliberately scoped to exactly the reserve/branch decision (steps 1-3 of
 * the plan's 5-step pattern) — it does NOT run the side effect or mark
 * completion itself (steps 4-5), since those vary per domain (e.g.
 * `send_email_executor.ts` needs to write `sentAt`/`providerMessageId` on
 * success, a shape this helper has no business knowing about). Callers use
 * `reserve()` to decide whether to act, then `complete()` to mark the
 * reservation's terminal state via a conditional UPDATE.
 */
export default class IdempotentOperation {
  /**
   * Attempts to reserve `idempotencyKey`. Three outcomes:
   *  - `proceed, resumed: false` — genuinely new reservation, run the side effect.
   *  - `proceed, resumed: true` — an earlier attempt reserved this key but
   *    went stale (crashed before completing) — safe to resume.
   *  - `skip` — either the operation already reached a terminal state
   *    (`reason: 'terminal'`, a true duplicate call — no-op success), or
   *    another attempt is actively in flight and fresh (`reason:
   *    'in_flight'` — let it finish, don't race it).
   */
  async reserve(options: ReserveOptions): Promise<ReservationOutcome> {
    const keyColumn = options.keyColumn ?? 'idempotency_key'
    const staleColumn = options.staleColumn ?? 'updated_at'
    const stalenessMinutes = options.stalenessMinutes ?? DEFAULT_STALENESS_MINUTES

    try {
      const inserted = await db.table(options.table).insert(options.insertRow)
      return { action: 'proceed', rowId: extractInsertId(inserted), resumed: false }
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error

      const existing = await db.from(options.table).where(keyColumn, options.idempotencyKey).first()

      // Extremely unlikely (the row that just caused our unique-violation
      // vanishing before we can re-read it), but never silently proceed as
      // if we'd reserved something we can't see — surface the original error.
      if (!existing) throw error

      if (options.terminalStatuses.includes(existing.status)) {
        return { action: 'skip', rowId: existing.id, reason: 'terminal' }
      }

      const staleBefore = DateTime.now().minus({ minutes: stalenessMinutes })
      const lastTouched = toDateTime(existing[staleColumn])
      if (lastTouched && lastTouched > staleBefore) {
        return { action: 'skip', rowId: existing.id, reason: 'in_flight' }
      }

      // Stale — reclaim it. Conditioned on still being in the in-flight
      // status (never unconditional), so a genuinely concurrent resume
      // attempt can't clobber a completion that landed in between.
      await db
        .from(options.table)
        .where('id', existing.id)
        .where('status', options.inFlightStatus)
        .update({ [staleColumn]: DateTime.now().toSQL({ includeOffset: false }) })

      return { action: 'proceed', rowId: existing.id, resumed: true }
    }
  }

  /**
   * Marks a reservation's terminal state, conditioned on it still being in
   * `inFlightStatus` — protects against a completion racing a concurrent
   * resume-by-another-worker past the staleness threshold (docs/plans/15-retry-and-idempotency.md
   * step 5: "jamais un UPDATE inconditionnel"). Returns whether the update
   * actually applied (false means someone else already completed or
   * reclaimed this reservation first — callers should treat that as a
   * benign no-op, not an error).
   */
  async complete(
    table: string,
    rowId: number,
    inFlightStatus: string,
    updates: Record<string, unknown>
  ): Promise<boolean> {
    const affected = await db
      .from(table)
      .where('id', rowId)
      .where('status', inFlightStatus)
      .update(updates)

    return toAffectedCount(affected) > 0
  }
}

function extractInsertId(inserted: unknown): number {
  if (Array.isArray(inserted)) {
    const first = inserted[0]
    if (typeof first === 'number') return first
    if (first && typeof first === 'object' && 'id' in first) return (first as { id: number }).id
  }
  throw new Error('IdempotentOperation.reserve: unexpected insert() return shape from the driver.')
}

function toAffectedCount(result: unknown): number {
  if (typeof result === 'number') return result
  if (Array.isArray(result)) return typeof result[0] === 'number' ? result[0] : result.length
  return 0
}

function toDateTime(value: unknown): DateTime | null {
  if (value instanceof Date) return DateTime.fromJSDate(value)
  if (typeof value === 'string') return DateTime.fromSQL(value)
  return null
}

/** mysql2 duplicate-key errors carry `code: 'ER_DUP_ENTRY'` (errno 1062). */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  )
}
