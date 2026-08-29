import { test } from '@japa/runner'
import { Worker } from 'bullmq'
import { queueConnection } from '#config/queue'
import queueRegistry from '#services/jobs/queue_registry'
import FailedJobsService, { FailedJobsUnavailableError } from '#services/jobs/failed_jobs_service'

const failedJobsService = new FailedJobsService()

/** Dispatches a job with a 1-attempt budget so it reaches `failed` immediately, no backoff wait. */
async function dispatchDoomedJob(jobName: string, data: Record<string, unknown>) {
  const queue = queueRegistry.getQueue('tracking')
  return queue.add(jobName, data, { attempts: 1 })
}

test.group('FailedJobsService', () => {
  test('list() surfaces a job that failed permanently, across queues', async ({
    assert,
    cleanup,
  }) => {
    const jobName = `test.failed_jobs.${Date.now()}`

    let settled!: () => void
    const failedSeen = new Promise<void>((resolve) => {
      settled = resolve
    })

    const worker = new Worker(
      'tracking',
      async (job) => {
        if (job.name !== jobName) return
        throw new Error('deliberate failure for the failed-jobs test')
      },
      { connection: queueConnection, concurrency: 1 }
    )
    worker.on('failed', (job) => {
      if (job?.name === jobName) settled()
    })
    cleanup(() => worker.close())

    await dispatchDoomedJob(jobName, { hello: 'world' })

    await Promise.race([
      failedSeen,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for the job to fail')), 5000)
      ),
    ])

    const all = await failedJobsService.list()
    const ours = all.find((j) => j.name === jobName)
    assert.exists(ours)
    assert.equal(ours!.queue, 'tracking')
    assert.equal(ours!.attemptsMade, 1)
    assert.deepEqual(ours!.data, { hello: 'world' })
    assert.isString(ours!.failedReason)

    const scoped = await failedJobsService.list('tracking')
    assert.isTrue(scoped.some((j) => j.name === jobName))

    const otherQueueOnly = await failedJobsService.list('segments')
    assert.isFalse(otherQueueOnly.some((j) => j.name === jobName))
  }).timeout(10_000)

  test('retry() re-queues a failed job and returns true; a missing job returns false', async ({
    assert,
    cleanup,
  }) => {
    const jobName = `test.failed_jobs.retry.${Date.now()}`
    let attempts = 0

    let firstFailureSeen!: () => void
    const firstFailure = new Promise<void>((resolve) => {
      firstFailureSeen = resolve
    })
    let succeededSeen!: () => void
    const succeeded = new Promise<void>((resolve) => {
      succeededSeen = resolve
    })

    const worker = new Worker(
      'tracking',
      async (job) => {
        if (job.name !== jobName) return
        attempts += 1
        if (attempts === 1) throw new Error('first attempt deliberately fails')
      },
      { connection: queueConnection, concurrency: 1 }
    )
    worker.on('failed', (job) => {
      if (job?.name === jobName) firstFailureSeen()
    })
    worker.on('completed', (job) => {
      if (job.name === jobName) succeededSeen()
    })
    cleanup(() => worker.close())

    const job = await dispatchDoomedJob(jobName, {})

    await Promise.race([
      firstFailure,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for the first failure')), 5000)
      ),
    ])

    const retried = await failedJobsService.retry('tracking', job.id!)
    assert.isTrue(retried)

    await Promise.race([
      succeeded,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for the retry to succeed')), 5000)
      ),
    ])
    assert.equal(attempts, 2)

    const missing = await failedJobsService.retry('tracking', 'does-not-exist')
    assert.isFalse(missing)
  }).timeout(10_000)

  test('list() surfaces a Redis failure as FailedJobsUnavailableError, not an unhandled exception', async ({
    assert,
  }) => {
    const queue = queueRegistry.getQueue('statistics')
    const original = queue.getFailed.bind(queue)

    ;(queue as any).getFailed = async () => {
      throw new Error('ECONNREFUSED simulated Redis outage')
    }

    try {
      await assert.rejects(() => failedJobsService.list('statistics'), FailedJobsUnavailableError)
    } finally {
      ;(queue as any).getFailed = original
    }
  })
})
