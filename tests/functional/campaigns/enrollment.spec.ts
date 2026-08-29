import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { Worker } from 'bullmq'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import SegmentService from '#services/segments/segment_service'
import SegmentContact from '#models/segment_contact'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import CampaignVersion from '#models/campaign_version'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignEnrollmentService, {
  enrollBatchJob,
} from '#services/campaigns/campaign_enrollment_service'
import SegmentMembershipAdded from '#events/segment_membership_added'
import { queueConnection } from '#config/queue'
import queueRegistry from '#services/jobs/queue_registry'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const segmentService = new SegmentService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()

async function createPublishedCampaign(reentryPolicy?: 'never' | 'after_exit' | 'always') {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const segment = await segmentService.save(project, {
    name: 'Everyone',
    definition: { combinator: 'AND', conditions: [] },
  })

  const campaign = await campaignService.create(project, owner, {
    name: 'Welcome series',
    reentryPolicy,
  })
  const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)

  const nodes: BuilderNode[] = [
    {
      clientKey: 'src',
      type: 'source',
      subtype: 'segment',
      config: { segmentId: segment.id },
      position: { x: 0, y: 0 },
    },
    {
      clientKey: 'wait',
      type: 'action',
      subtype: 'wait',
      config: { durationValue: 1, durationUnit: 'days' },
      position: { x: 100, y: 0 },
    },
  ]
  const edges: BuilderEdge[] = [
    { sourceClientKey: 'src', targetClientKey: 'wait', sourceHandle: null },
  ]
  await builderService.saveDraft(draft, { nodes, edges })
  await builderService.publish(draft, owner)
  await campaign.refresh()

  return { owner, project, segment, campaign }
}

/** Runs one real BullMQ Worker on `campaign-engine` until `count` jobs of `jobName` complete, or times out. */
function waitForJobsProcessed(jobName: string, count: number, timeoutMs = 8000) {
  let processed = 0
  let resolveAll!: () => void
  const done = new Promise<void>((resolve) => {
    resolveAll = resolve
  })

  const worker = new Worker(
    'campaign-engine',
    async (job) => {
      const handler = jobHandlerRegistry.resolve('campaign-engine', job.name)
      await handler(job.data, job)
      if (job.name === jobName) {
        processed += 1
        if (processed >= count) resolveAll()
      }
    },
    {
      connection: queueConnection,
      concurrency: 2,
      settings: { backoffStrategy: queueRegistry.backoffStrategyFor('campaign-engine') },
    }
  )

  const result = Promise.race([
    done,
    new Promise<void>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${count} "${jobName}" job(s)`)),
        timeoutMs
      )
    ),
  ])

  return { worker, result }
}

test.group('Campaign enrollment (functional, end-to-end)', () => {
  test('SegmentMembershipAdded -> listener -> enroll_batch job -> enrollment + execution created', async ({
    assert,
    cleanup,
  }) => {
    const { project, segment, campaign } = await createPublishedCampaign()
    const owner = await UserFactory.create()
    const contact = await contactService.create(project, owner, {
      email: 'new-member@example.com',
    })

    const { worker, result } = waitForJobsProcessed('campaign.enroll_batch', 1)
    cleanup(() => worker.close())

    await SegmentMembershipAdded.dispatch(segment.id, [contact.id])
    await result

    const enrollment = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .first()
    assert.isNotNull(enrollment)
    assert.equal(enrollment!.status, 'active')

    const execution = await enrollment!.related('execution').query().first()
    assert.isNotNull(execution)
  }).timeout(15_000)

  /** Sets up project/segment/contact-already-in-segment/campaign-with-source-node, but does NOT publish. */
  async function setupCampaignWithPreexistingMember(enrollExistingMembers: boolean) {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Marketing',
      timezone: 'Europe/Paris',
    })
    const segment = await segmentService.save(project, {
      name: 'Everyone',
      definition: { combinator: 'AND', conditions: [] },
    })

    // Membership predates the campaign's first activation — this is
    // precisely the case `SegmentMembershipAdded` never fires for again
    // (see EnrollExistingSegmentMembersOnCampaignActivated).
    const contact = await contactService.create(project, owner, {
      email: 'already-a-member@example.com',
    })
    await SegmentContact.create({
      segmentId: segment.id,
      contactId: contact.id,
      addedAt: DateTime.now(),
    })

    const campaign = await campaignService.create(project, owner, {
      name: 'Welcome series',
      enrollExistingMembers,
    })
    const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)

    const nodes: BuilderNode[] = [
      {
        clientKey: 'src',
        type: 'source',
        subtype: 'segment',
        config: { segmentId: segment.id },
        position: { x: 0, y: 0 },
      },
      {
        clientKey: 'wait',
        type: 'action',
        subtype: 'wait',
        config: { durationValue: 1, durationUnit: 'days' },
        position: { x: 100, y: 0 },
      },
    ]
    const edges: BuilderEdge[] = [
      { sourceClientKey: 'src', targetClientKey: 'wait', sourceHandle: null },
    ]
    await builderService.saveDraft(draft, { nodes, edges })

    return { owner, project, segment, contact, campaign, draft }
  }

  test('opted in (enrollExistingMembers=true): a contact already in the source segment is enrolled retroactively on first activation', async ({
    assert,
    cleanup,
  }) => {
    const { owner, draft, campaign, contact } = await setupCampaignWithPreexistingMember(true)

    const { worker, result } = waitForJobsProcessed('campaign.enroll_batch', 1)
    cleanup(() => worker.close())

    await builderService.publish(draft, owner)
    await result

    const enrollment = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .first()
    assert.isNotNull(enrollment)
    assert.equal(enrollment!.status, 'active')

    const execution = await enrollment!.related('execution').query().first()
    assert.isNotNull(execution)
  }).timeout(15_000)

  test('opted out (default, enrollExistingMembers=false): a contact already in the source segment is NOT enrolled on first activation', async ({
    assert,
  }) => {
    const { owner, draft, campaign, contact } = await setupCampaignWithPreexistingMember(false)

    await builderService.publish(draft, owner)

    // No job is enqueued at all for this campaign in the opted-out case, so
    // there's nothing to await — a short settle is enough to catch a
    // regression where the listener fires unconditionally.
    await new Promise((resolve) => setTimeout(resolve, 300))

    const enrollment = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .first()
    assert.isNull(enrollment)
  })

  test('a contact who exits and re-enters the source segment without a status change is never re-enrolled under reentry_policy "never"', async ({
    assert,
  }) => {
    const { project, segment, campaign } = await createPublishedCampaign('never')
    const owner = await UserFactory.create()
    const contact = await contactService.create(project, owner, { email: 'loop@example.com' })

    const enrollmentService = new CampaignEnrollmentService()

    await enrollmentService.enroll(campaign, contact, segment.id)
    const first = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .firstOrFail()
    first.status = 'exited'
    await first.save()

    // Re-enter the segment source without any status change on the contact.
    await enrollmentService.enroll(campaign, contact, segment.id)

    const enrollments = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
    assert.lengthOf(enrollments, 1)
  })

  test('one problematic contact in a batch does not block the others from being enrolled', async ({
    assert,
  }) => {
    const { project, segment, campaign } = await createPublishedCampaign('never')
    const owner = await UserFactory.create()
    const goodContactA = await contactService.create(project, owner, {
      email: 'good-a@example.com',
    })
    const goodContactB = await contactService.create(project, owner, {
      email: 'good-b@example.com',
    })

    const enrollmentService = new CampaignEnrollmentService()

    // Pre-enroll goodContactA so it already has a terminal enrollment under
    // 'never' — this contact will be silently skipped (not a crash) by
    // enroll(), which is the "problematic" case the batch job must not let
    // block the rest.
    await enrollmentService.enroll(campaign, goodContactA, segment.id)
    const priorEnrollment = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', goodContactA.id)
      .firstOrFail()
    priorEnrollment.status = 'completed'
    await priorEnrollment.save()

    await enrollBatchJob(
      {
        campaignId: campaign.id,
        segmentId: segment.id,
        contactIds: [goodContactA.id, goodContactB.id],
      },
      {} as never
    )

    const enrollmentsA = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', goodContactA.id)
    assert.lengthOf(enrollmentsA, 1) // unchanged: 'never' policy skipped a second enroll

    const enrollmentsB = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', goodContactB.id)
    assert.lengthOf(enrollmentsB, 1)
    assert.equal(enrollmentsB[0].status, 'active')
  })
})
