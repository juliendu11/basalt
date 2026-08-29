import type { Job } from 'bullmq'
import NonRetryableError from '#exceptions/non_retryable_error'
import type { QueueName } from '#config/queue'

export type JobHandler<Payload = any> = (payload: Payload, job: Job<Payload>) => Promise<void>

/**
 * Maps `queueName:jobName` to the handler that processes it. Symmetric to
 * QueueDispatcher on the producer side: each domain registers its handlers
 * here (typically from a `start/jobs.ts` preload) instead of the
 * `queue:work` command knowing about every domain's job types.
 *
 * See docs/plans/14-jobs-and-queues.md.
 */
class JobHandlerRegistry {
  #handlers = new Map<string, JobHandler>()

  register<Payload>(queueName: QueueName, jobName: string, handler: JobHandler<Payload>) {
    const key = JobHandlerRegistry.#key(queueName, jobName)

    if (this.#handlers.has(key)) {
      throw new NonRetryableError(`A handler is already registered for "${key}"`)
    }

    this.#handlers.set(key, handler)
  }

  resolve(queueName: QueueName, jobName: string): JobHandler {
    const handler = this.#handlers.get(JobHandlerRegistry.#key(queueName, jobName))

    if (!handler) {
      throw new NonRetryableError(
        `No job handler registered for job "${jobName}" on queue "${queueName}"`
      )
    }

    return handler
  }

  static #key(queueName: QueueName, jobName: string) {
    return `${queueName}:${jobName}`
  }
}

export default new JobHandlerRegistry()
