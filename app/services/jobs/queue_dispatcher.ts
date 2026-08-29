import type { Job, JobsOptions } from 'bullmq'
import logger from '@adonisjs/core/services/logger'
import queueRegistry from '#services/jobs/queue_registry'
import type { QueueName } from '#config/queue'

export interface DispatchOptions {
  /**
   * Deterministic job id. When provided, BullMQ refuses to add a second
   * job with the same id already present in the queue (native dedupe on
   * enqueue) — used to avoid piling up redundant work, e.g. a second
   * `campaign-engine.advance` for an execution that already has one
   * pending. Do NOT use a random value here.
   */
  jobId?: string
  /** Delay (ms) before the job becomes eligible — used for wait/scheduling. */
  delay?: number
}

/**
 * Single facade used by the rest of the codebase (listeners, services) to
 * enqueue work. Nothing outside app/services/jobs/** should import BullMQ
 * directly — this keeps the dependency swappable and centralises the
 * default job options (attempts/backoff) per queue.
 *
 * See docs/plans/14-jobs-and-queues.md.
 */
class QueueDispatcher {
  async dispatch<Payload extends Record<string, unknown>>(
    queueName: QueueName,
    jobName: string,
    payload: Payload,
    options: DispatchOptions = {}
  ): Promise<Job<Payload>> {
    const queue = queueRegistry.getQueue(queueName)
    const defaults = queueRegistry.defaultsFor(queueName)

    const jobOptions: JobsOptions = {
      attempts: defaults.attempts,
      backoff: { type: 'custom' },
      // Keep a bounded history of completed/failed jobs so the
      // observability screen (docs/plans/20-observability-and-audit.md)
      // has something to show without Redis growing unbounded.
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { count: 5000 },
      jobId: options.jobId,
      delay: options.delay,
    }

    try {
      return await queue.add(jobName, payload, jobOptions)
    } catch (error) {
      logger.error({ err: error, queueName, jobName }, 'Failed to enqueue job')
      throw error
    }
  }
}

export default new QueueDispatcher()
