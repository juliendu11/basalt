import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import CampaignExecution from '#models/campaign_execution'

const DEFAULT_STALENESS_MINUTES = 5

export interface ExecutionStateUpdate {
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  currentNodeId?: number | null
  scheduledAt?: DateTime
  startedAt?: DateTime | null
  finishedAt?: DateTime | null
  lastError?: string | null
  attemptCount?: number
}

/**
 * Optimistic locking + staleness recovery for `campaign_executions`
 * (docs/plans/12-campaign-engine.md § Concurrence, § Domain concepts) — the
 * single most safety-critical piece of the Campaign Engine: it's what
 * guarantees at most one worker advances a given execution at a time
 * (`init.md` Scenario 5), while still recovering an execution whose worker
 * crashed mid-transition rather than leaving it locked forever.
 *
 * Two independent mechanisms, matched to the plan's wording exactly:
 *  - `locked_at`/`locked_by` (coarse, staleness-based): claims the right to
 *    WORK on an execution. `acquire()` only succeeds if nobody currently
 *    holds a fresh lock.
 *  - `lock_version` (fine-grained, optimistic): guards the actual state
 *    WRITE at the end of a transition. `release()`'s conditional UPDATE is
 *    what would catch a genuine concurrency bug (two workers both believing
 *    they hold the lock) — per the plan this should be unreachable given
 *    `acquire()`'s own guarantee, so a 0-row result here is treated as an
 *    internal error rather than swallowed, to surface a real bug loudly
 *    instead of silently corrupting execution state.
 */
export default class ExecutionLockService {
  /**
   * Attempts to claim `executionId` for `workerId`. Returns the freshly
   * reloaded execution on success, or `null` if another worker already
   * holds a fresh (non-stale) lock — callers MUST treat `null` as a silent
   * no-op (log and return), never as an error or a reason to retry.
   */
  async acquire(
    executionId: number,
    workerId: string,
    stalenessMinutes = DEFAULT_STALENESS_MINUTES
  ): Promise<CampaignExecution | null> {
    const staleBefore = DateTime.now()
      .minus({ minutes: stalenessMinutes })
      .toSQL({ includeOffset: false })
    const now = DateTime.now().toSQL({ includeOffset: false })

    const affected = await db
      .from('campaign_executions')
      .where('id', executionId)
      .where((query) => {
        query.whereNull('locked_at').orWhere('locked_at', '<', staleBefore)
      })
      .update({ locked_at: now, locked_by: workerId })

    if (toAffectedCount(affected) === 0) return null

    return CampaignExecution.query().where('id', executionId).firstOrFail()
  }

  /**
   * Applies the caller's state transition and releases the lock, guarded by
   * the optimistic `lock_version` check. Throws if the conditional update
   * affects 0 rows (see class doc — a real bug, not an expected outcome).
   */
  async release(
    executionId: number,
    expectedLockVersion: number,
    updates: ExecutionStateUpdate
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      status: updates.status,
      lock_version: expectedLockVersion + 1,
      locked_at: null,
      locked_by: null,
    }

    if ('currentNodeId' in updates) payload.current_node_id = updates.currentNodeId
    if (updates.scheduledAt) {
      payload.scheduled_at = updates.scheduledAt.toSQL({ includeOffset: false })
    }
    if ('startedAt' in updates) {
      payload.started_at = updates.startedAt
        ? updates.startedAt.toSQL({ includeOffset: false })
        : null
    }
    if ('finishedAt' in updates) {
      payload.finished_at = updates.finishedAt
        ? updates.finishedAt.toSQL({ includeOffset: false })
        : null
    }
    if ('lastError' in updates) payload.last_error = updates.lastError
    if (updates.attemptCount !== undefined) payload.attempt_count = updates.attemptCount

    const affected = await db
      .from('campaign_executions')
      .where('id', executionId)
      .where('lock_version', expectedLockVersion)
      .update(payload)

    if (toAffectedCount(affected) === 0) {
      throw new Error(
        `ExecutionLockService.release: no row updated for execution ${executionId} at ` +
          `lock_version ${expectedLockVersion} — this should be unreachable if acquire() was ` +
          `called first; indicates a concurrency bug, not an expected race.`
      )
    }
  }
}

/** Same normalization as `CampaignBuilderService`'s `toAffectedCount` — mysql2 returns a plain count. */
function toAffectedCount(result: unknown): number {
  if (typeof result === 'number') return result
  if (Array.isArray(result)) return typeof result[0] === 'number' ? result[0] : result.length
  return 0
}
