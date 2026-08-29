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
      await queueDispatcher.dispatch(
        'campaign-engine',
        'campaign-engine.advance',
        { executionId: execution.id },
        // Deterministic id: if this execution already has an `advance` job
        // pending (e.g. re-enqueued directly by the engine itself after a
        // 'continue'/'branch' transition), BullMQ's native dedupe-on-add
        // (docs/plans/14-jobs-and-queues.md) silently skips adding a
        // second one rather than piling up redundant work. Must not
        // contain `:` — BullMQ reserves that character in custom job ids
        // for its own repeatable-job id format (`job.js#validateOptions`:
        // a colon-bearing id must split into exactly 3 parts or `queue.add`
        // throws "Custom Id cannot contain :", which silently broke every
        // wait-node resume since this scheduler always hit that path).
        { jobId: `campaign-engine.advance-${execution.id}` }
      )
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
