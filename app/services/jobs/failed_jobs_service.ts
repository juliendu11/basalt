import queueRegistry from '#services/jobs/queue_registry'
import { queueNames, type QueueName } from '#config/queue'

export interface FailedJobEntry {
  id: string
  queue: QueueName
  name: string
  failedReason: string
  attemptsMade: number
  // `any`, not `Record<string, unknown>` — a nested `unknown`/`Record<...>`
  // field anywhere inside an `inertia.render()` prop object collapses that
  // whole call's argument type to `never` (see the
  // inertia_props_unknown_type_never entry in the memory system); the raw
  // BullMQ job payload is inherently untyped anyway.
  data: any
  timestamp: number
}

/**
 * Thin adapter over BullMQ's native failed-job API (docs/plans/20-observability-and-audit.md
 * § Backend architecture) — no reimplementation, just a display-friendly
 * shape plus explicit Redis-unavailable error handling (the plan's own
 * Failure scenarios section: the screen must show a clear error rather
 * than an unhandled exception/broken page).
 *
 * Security note (docs/plans/20-observability-and-audit.md § Security
 * considerations): verified every job payload registered across this
 * codebase (`start/jobs.ts`) — none carries a decrypted secret. SMTP sends
 * (`send_email_executor.ts`) only ever pass `executionId`/`nodeId`
 * (resolved to a connector and decrypted internally, never serialized into
 * a job payload); every other job payload is plain ids/primitives.
 */
export default class FailedJobsService {
  async list(queueName?: QueueName): Promise<FailedJobEntry[]> {
    const names = queueName ? [queueName] : queueNames

    try {
      const perQueue = await Promise.all(
        names.map(async (name) => {
          const queue = queueRegistry.getQueue(name)
          const jobs = await queue.getFailed()

          return jobs.map((job): FailedJobEntry => ({
            id: job.id ?? '',
            queue: name,
            name: job.name,
            failedReason: job.failedReason ?? 'Unknown error',
            attemptsMade: job.attemptsMade,
            data: job.data as Record<string, unknown>,
            timestamp: job.timestamp,
          }))
        })
      )

      return perQueue.flat().sort((a, b) => b.timestamp - a.timestamp)
    } catch (error) {
      throw new FailedJobsUnavailableError(error)
    }
  }

  async retry(queueName: QueueName, jobId: string): Promise<boolean> {
    try {
      const queue = queueRegistry.getQueue(queueName)
      const job = await queue.getJob(jobId)
      if (!job) return false

      await job.retry()
      return true
    } catch (error) {
      throw new FailedJobsUnavailableError(error)
    }
  }
}

/** Raised when the failed-jobs screen can't reach Redis/BullMQ. */
export class FailedJobsUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Unable to retrieve failed jobs — Redis appears to be unavailable.')
    this.cause = cause
  }
}
