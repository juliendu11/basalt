import { test } from '@japa/runner'
import { Worker } from 'bullmq'
import { queueConnection } from '#config/queue'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import queueRegistry from '#services/jobs/queue_registry'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'

/**
 * End-to-end check of the BullMQ wiring (docs/plans/14-jobs-and-queues.md):
 * a job dispatched through QueueDispatcher is actually picked up by a real
 * Worker connected to Redis and routed to the registered handler.
 */
test.group('QueueDispatcher + Worker (functional)', () => {
  test('a dispatched job is picked up and processed by a worker', async ({ assert, cleanup }) => {
    const jobName = 'test.functional.echo'
    let receivedPayload: unknown

    let resolveProcessed!: () => void
    const processed = new Promise<void>((resolve) => {
      resolveProcessed = resolve
    })

    jobHandlerRegistry.register('tracking', jobName, async (payload) => {
      receivedPayload = payload
      resolveProcessed()
    })

    const worker = new Worker(
      'tracking',
      async (job) => {
        const handler = jobHandlerRegistry.resolve('tracking', job.name)
        await handler(job.data, job)
      },
      {
        connection: queueConnection,
        concurrency: 1,
        settings: { backoffStrategy: queueRegistry.backoffStrategyFor('tracking') },
      }
    )
    cleanup(() => worker.close())

    await queueDispatcher.dispatch('tracking', jobName, { hello: 'world' })

    await Promise.race([
      processed,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for the job to be processed')), 5000)
      ),
    ])

    assert.deepEqual(receivedPayload, { hello: 'world' })
  }).timeout(10_000)
})
