import { Worker, UnrecoverableError, type Job } from 'bullmq'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { queueConnection, queueNames, type QueueName } from '#config/queue'
import queueRegistry from '#services/jobs/queue_registry'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'
import NonRetryableError from '#exceptions/non_retryable_error'

/**
 * Starts one BullMQ Worker per requested queue. Meant to run as a
 * long-lived process, separate from the HTTP server (docs/plans/14-jobs-and-queues.md).
 *
 * Examples:
 *   node ace queue:work                       # consume every queue
 *   node ace queue:work --queue=emails         # consume a single queue
 *   node ace queue:work --queue=emails,tracking
 */
export default class Work extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Start BullMQ workers for the given queues'

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  @flags.string({ description: 'Comma-separated queue names to consume (default: all)' })
  declare queue?: string

  #workers: Worker[] = []

  async run() {
    const names = this.#resolveQueueNames()

    if (!names) {
      // Validation failed: exitCode is already set, force an immediate
      // shutdown rather than letting the process hang (staysAlive is
      // static on this command, so it would otherwise wait for a signal).
      await this.terminate()
      return
    }

    for (const name of names) {
      this.#startWorker(name)
    }

    this.app.terminating(async () => {
      this.logger.info('Shutting down queue workers gracefully...')
      await Promise.all(this.#workers.map((worker) => worker.close()))
    })
  }

  #startWorker(name: QueueName) {
    const defaults = queueRegistry.defaultsFor(name)

    const worker = new Worker(
      name,
      async (job: Job) => {
        const handler = jobHandlerRegistry.resolve(name, job.name)
        try {
          await handler(job.data, job)
        } catch (error) {
          // NonRetryableError (docs/plans/15-retry-and-idempotency.md § Domain
          // concepts) means retrying would never change the outcome (a 5xx
          // SMTP rejection, invalid credentials, ...) — BullMQ's own
          // `UnrecoverableError` is the native mechanism to fail the job
          // immediately regardless of the queue's configured `attempts`,
          // rather than burning the full retry budget on a foregone
          // conclusion. Any other error (including RetryableError, and
          // anything un-typed) propagates as-is, so the queue's normal
          // attempts/backoff configuration (QueueRegistry) applies.
          if (error instanceof NonRetryableError) {
            throw new UnrecoverableError(error.message)
          }
          throw error
        }
      },
      {
        connection: queueConnection,
        concurrency: defaults.concurrency,
        settings: { backoffStrategy: queueRegistry.backoffStrategyFor(name) },
      }
    )

    worker.on('failed', (job, error) => {
      this.logger.error(`[${name}] job "${job?.name}" (${job?.id}) failed: ${error.message}`)
    })

    worker.on('error', (error) => {
      this.logger.error(`[${name}] worker error: ${error.message}`)
    })

    this.#workers.push(worker)
    this.logger.info(`Worker started for queue "${name}" (concurrency: ${defaults.concurrency})`)
  }

  /** Returns null (and sets a non-zero exitCode) when --queue names an unknown queue. */
  #resolveQueueNames(): QueueName[] | null {
    if (!this.queue) {
      return [...queueNames]
    }

    const requested = this.queue.split(',').map((name) => name.trim())
    const invalid = requested.filter((name) => !queueNames.includes(name as QueueName))

    if (invalid.length > 0) {
      this.logger.error(
        `Unknown queue(s): ${invalid.join(', ')}. Known queues: ${queueNames.join(', ')}`
      )
      this.exitCode = 1
      return null
    }

    return requested as QueueName[]
  }
}
