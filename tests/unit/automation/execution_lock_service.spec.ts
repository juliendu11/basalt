import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import ContactService from '#services/contacts/contact_service'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import ExecutionLockService from '#services/automation/execution_lock_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const campaignService = new CampaignService()
const contactService = new ContactService()
const lockService = new ExecutionLockService()

async function createExecution() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
  const contact = await contactService.create(project, owner, { email: 'a@example.com' })

  const enrollment = await CampaignEnrollment.create({
    projectId: project.id,
    campaignId: campaign.id,
    campaignVersionId: campaign.draftVersionId!,
    contactId: contact.id,
    status: 'active',
    source: 'test',
    enrolledAt: DateTime.now(),
  })

  const execution = await CampaignExecution.create({
    campaignEnrollmentId: enrollment.id,
    status: 'pending',
    scheduledAt: DateTime.now(),
  })

  return { execution }
}

test.group('ExecutionLockService', () => {
  test('acquire succeeds when the execution is unlocked', async ({ assert }) => {
    const { execution } = await createExecution()

    const acquired = await lockService.acquire(execution.id, 'worker-1')

    assert.isNotNull(acquired)
    assert.isNotNull(acquired!.lockedAt)
    assert.equal(acquired!.lockedBy, 'worker-1')
  })

  test('a second acquire fails while the first lock is fresh', async ({ assert }) => {
    const { execution } = await createExecution()

    const first = await lockService.acquire(execution.id, 'worker-1')
    const second = await lockService.acquire(execution.id, 'worker-2')

    assert.isNotNull(first)
    assert.isNull(second)
  })

  test('only one of two concurrent acquire calls succeeds', async ({ assert }) => {
    const { execution } = await createExecution()

    const [a, b] = await Promise.all([
      lockService.acquire(execution.id, 'worker-a'),
      lockService.acquire(execution.id, 'worker-b'),
    ])

    const successes = [a, b].filter((result) => result !== null)
    assert.lengthOf(successes, 1)
  })

  test('a stale lock (older than the threshold) can be reacquired by another worker', async ({
    assert,
  }) => {
    const { execution } = await createExecution()
    execution.lockedAt = DateTime.now().minus({ minutes: 10 })
    execution.lockedBy = 'worker-crashed'
    await execution.save()

    const reacquired = await lockService.acquire(execution.id, 'worker-2', 5)

    assert.isNotNull(reacquired)
    assert.equal(reacquired!.lockedBy, 'worker-2')
  })

  test('release applies state updates and increments lock_version', async ({ assert }) => {
    const { execution } = await createExecution()
    const acquired = await lockService.acquire(execution.id, 'worker-1')

    await lockService.release(execution.id, acquired!.lockVersion, {
      status: 'waiting',
      scheduledAt: DateTime.now().plus({ days: 2 }),
    })

    await execution.refresh()
    assert.equal(execution.status, 'waiting')
    assert.equal(execution.lockVersion, acquired!.lockVersion + 1)
    assert.isNull(execution.lockedAt)
    assert.isNull(execution.lockedBy)
  })

  test('release throws if the expected lock_version no longer matches', async ({ assert }) => {
    const { execution } = await createExecution()
    const acquired = await lockService.acquire(execution.id, 'worker-1')

    await lockService.release(execution.id, acquired!.lockVersion, { status: 'pending' })

    await assert.rejects(() =>
      lockService.release(execution.id, acquired!.lockVersion, { status: 'pending' })
    )
  })
})
