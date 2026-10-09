import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'
import { Worker } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { queueConnection } from '#config/queue'
import QueueRegistry from '#services/jobs/queue_registry'
import FailedJobsService, { FailedJobsUnavailableError } from '#services/jobs/failed_jobs_service'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import EmailDelivery from '#models/email_delivery'

const queueRegistry = await app.container.make(QueueRegistry)

const failedJobsService = await app.container.make(FailedJobsService)
const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()

/** A real email_deliveries row so a tracking job's `deliveryId` resolves to a project. */
async function createDeliveryInProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, {
    email: `contact-${randomUUID()}@example.com`,
  })
  const delivery = await EmailDelivery.create({
    projectId: project.id,
    contactId: contact.id,
    idempotencyKey: randomUUID(),
    status: 'sent',
  })
  return { project, delivery }
}

/** Dispatches a job with a 1-attempt budget so it reaches `failed` immediately, no backoff wait. */
async function dispatchDoomedJob(jobName: string, data: Record<string, unknown>) {
  const queue = queueRegistry.getQueue('tracking')
  return queue.add(jobName, data, { attempts: 1 })
}

function runDoomedWorker(jobName: string, onFailed: () => void) {
  const worker = new Worker(
    'tracking',
    async (job) => {
      if (job.name !== jobName) return
      throw new Error('deliberate failure for the failed-jobs test')
    },
    { connection: queueConnection, concurrency: 1 }
  )
  worker.on('failed', (job) => {
    if (job?.name === jobName) onFailed()
  })
  return worker
}

function waitOrTimeout(promise: Promise<void>, message: string, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

test.group('FailedJobsService (tenant-scoped)', () => {
  test('list() only returns the requesting project’s failed jobs', async ({ assert, cleanup }) => {
    const { project, delivery } = await createDeliveryInProject()
    const { project: otherProject } = await createDeliveryInProject()
    const jobName = `test.failed_jobs.${Date.now()}`

    let settled!: () => void
    const failedSeen = new Promise<void>((resolve) => (settled = resolve))
    const worker = runDoomedWorker(jobName, settled)
    cleanup(() => worker.close())

    await dispatchDoomedJob(jobName, { deliveryId: delivery.id, type: 'opened' })
    await waitOrTimeout(failedSeen, 'Timed out waiting for the job to fail')

    const mine = await failedJobsService.list(project.id)
    const ours = mine.find((j) => j.name === jobName)
    assert.exists(ours, 'the job should be visible to its own project')
    assert.equal(ours!.queue, 'tracking')
    assert.equal(ours!.attemptsMade, 1)
    assert.isString(ours!.failedReason)

    // Isolation: another project never sees this job.
    const foreign = await failedJobsService.list(otherProject.id)
    assert.isFalse(
      foreign.some((j) => j.name === jobName),
      'the job must NOT leak to another project'
    )

    // Queue filter still applies within the owning project.
    const wrongQueue = await failedJobsService.list(project.id, 'segments')
    assert.isFalse(wrongQueue.some((j) => j.name === jobName))
  }).timeout(10_000)

  test('retry() re-queues only for the owning project; a foreign project is treated as not-found', async ({
    assert,
    cleanup,
  }) => {
    const { project, delivery } = await createDeliveryInProject()
    const { project: otherProject } = await createDeliveryInProject()
    const jobName = `test.failed_jobs.retry.${Date.now()}`
    let attempts = 0

    let firstFailureSeen!: () => void
    const firstFailure = new Promise<void>((resolve) => (firstFailureSeen = resolve))
    let succeededSeen!: () => void
    const succeeded = new Promise<void>((resolve) => (succeededSeen = resolve))

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

    const job = await dispatchDoomedJob(jobName, { deliveryId: delivery.id, type: 'opened' })
    await waitOrTimeout(firstFailure, 'Timed out waiting for the first failure')

    // Isolation: another project cannot retry this job, and must not trigger it.
    const foreignRetry = await failedJobsService.retry(otherProject.id, 'tracking', job.id!)
    assert.isFalse(foreignRetry, 'a foreign project must not be able to retry the job')
    assert.equal(attempts, 1, 'the job must not have been re-run by the foreign retry')

    // The owning project can retry it.
    const retried = await failedJobsService.retry(project.id, 'tracking', job.id!)
    assert.isTrue(retried)
    await waitOrTimeout(succeeded, 'Timed out waiting for the retry to succeed')
    assert.equal(attempts, 2)

    const missing = await failedJobsService.retry(project.id, 'tracking', 'does-not-exist')
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
      await assert.rejects(
        () => failedJobsService.list(1, 'statistics'),
        FailedJobsUnavailableError
      )
    } finally {
      ;(queue as any).getFailed = original
    }
  })
})
