/*
|--------------------------------------------------------------------------
| Periodic task registration
|--------------------------------------------------------------------------
|
| Each domain registers what it needs run periodically here, driven by
| `node ace scheduler:run` (docs/plans/14-jobs-and-queues.md § Scheduling
| périodique).
|
*/

import Segment from '#models/segment'
import scheduledTaskRegistry from '#services/jobs/scheduled_task_registry'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import ExecutionSchedulerService from '#services/automation/execution_scheduler_service'

/**
 * Nightly full-recompute safety net for every segment of every project
 * (docs/plans/06-segments.md § Jobs / Commands, ADR-003) — catches
 * time-based definitions (e.g. `createdAt < 30 days`) that no
 * `ContactCreated`/`ContactUpdated` event would ever trigger a targeted
 * recompute for. Enqueues directly rather than shelling out to
 * `segments:recompute` (avoids spawning a subprocess for something already
 * expressible in-process).
 */
scheduledTaskRegistry.register(
  'segments.recompute_all',
  { type: 'daily', atUtc: '03:00' },
  async () => {
    const segments = await Segment.all()

    for (const segment of segments) {
      await queueDispatcher.dispatch('segments', 'segment.recompute', {
        segmentId: segment.id,
        mode: 'full',
      })
    }
  }
)

/**
 * The mechanism that makes `wait` nodes survive restarts without an open
 * request/process (docs/plans/12-campaign-engine.md § Domain concepts,
 * § Jobs / Commands) — polls for due executions every 60s (granularity
 * documented as acceptable: no campaign wait needs second-level precision)
 * and enqueues one `campaign-engine.advance` job per execution, in bounded
 * batches via `ExecutionSchedulerService.findDueExecutions`.
 */
const executionSchedulerService = new ExecutionSchedulerService()

scheduledTaskRegistry.register(
  'campaign-engine.schedule_due_executions',
  { type: 'interval', everySeconds: 60 },
  async () => {
    const executions = await executionSchedulerService.findDueExecutions()

    for (const execution of executions) {
      // No `jobId` on purpose. A deterministic, execution-scoped id
      // (`campaign-engine.advance-${execution.id}`) was tried here to
      // dedupe redundant enqueues, but BullMQ dedupes `queue.add` against
      // jobs in EVERY state — including the completed/failed jobs we
      // deliberately retain (`removeOnComplete`/`removeOnFail` in
      // queue_dispatcher.ts), which BullMQ only trims lazily (when another
      // job on the same queue finishes), never on a timer. So once one
      // resume job for an execution had completed and was still retained,
      // every subsequent 60s pass called `queue.add` with the same id,
      // got the retained completed job back, and enqueued NOTHING — the
      // execution stayed `waiting` with a past `scheduled_at` forever, and
      // no job meant no "failed job" to notice. With daily-cadence wait
      // nodes (~24h) landing right on the retention age, this bit on the
      // second wait cycle of essentially every enrollment.
      // See docs/incidents/2026-09-03-wait-node-resume-jobid-dedupe.md.
      //
      // Dropping the id is safe: duplicate `advance` jobs for the same
      // execution are already harmless — `ExecutionLockService` lets at
      // most one worker advance an execution at a time (the others no-op),
      // the current node is re-read under that lock, and `send_email`
      // sends are idempotent on `email_deliveries.idempotency_key`
      // (decisions/ADR-005-email-idempotency.md). The worst case is 1-2
      // extra no-op jobs per execution per 60s window until the worker
      // drains the first one.
      await queueDispatcher.dispatch('campaign-engine', 'campaign-engine.advance', {
        executionId: execution.id,
      })
    }
  }
)

/**
 * Nightly pre-aggregation of `project_daily_stats`/`campaign_daily_stats`
 * for yesterday (docs/plans/18-statistics-dashboard.md § Jobs / Commands)
 * — 04:00 UTC, after the segments sweep's 03:00 slot, off-peak either way.
 * Enqueues rather than running inline so a slow aggregation across many
 * projects doesn't block the scheduler process from evaluating other due
 * tasks.
 */
scheduledTaskRegistry.register(
  'statistics.aggregate_daily',
  { type: 'daily', atUtc: '04:00' },
  async () => {
    await queueDispatcher.dispatch('statistics', 'statistics.aggregate_daily', {})
  }
)
