import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import Segment from '#models/segment'
import ContactCreated from '#events/contact_created'
import ContactUpdated from '#events/contact_updated'
import RecomputeSegmentsOnContactChange from '#listeners/recompute_segments_on_contact_change'
import queueRegistry from '#services/jobs/queue_registry'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const listener = new RecomputeSegmentsOnContactChange()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, project }
}

async function pendingSegmentIds(): Promise<number[]> {
  const queue = queueRegistry.getQueue('segments')
  const jobs = await queue.getJobs(['waiting', 'delayed'])
  return jobs.map((job) => job.data.segmentId as number)
}

test.group('RecomputeSegmentsOnContactChange', (group) => {
  // Unlike the database (rolled back per test via testUtils.db().withGlobalTransaction()),
  // the BullMQ/Redis queue is real, shared, global state that persists across tests —
  // drain it first so a leftover job from an earlier test (whose rolled-back segment id
  // can coincidentally be reused by this test's freshly-created rows) never pollutes
  // these assertions.
  group.each.setup(async () => {
    await queueRegistry.getQueue('segments').drain(true)
  })

  test('ContactCreated enqueues a targeted recompute for every segment of the project', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const relevant = await Segment.create({
      projectId: project.id,
      name: 'S1',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: ['country'],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })

    const contact = await contactService.create(project, owner, { email: 'a@example.com' })

    await listener.handle(new ContactCreated(contact, owner))

    const ids = await pendingSegmentIds()
    assert.include(ids, relevant.id)
  })

  test('ContactUpdated only enqueues segments referencing a changed field', async ({ assert }) => {
    const { owner, project } = await createProject()
    // The contact is created (and its real ContactCreated event fires and
    // enqueues jobs of its own, per the other test above) *before* these
    // segments exist, so that automatic firing enqueues nothing here — this
    // test only cares about what the manual ContactUpdated call below
    // enqueues, and creating segments after the contact keeps the queue
    // clean for that specific assertion.
    const contact = await contactService.create(project, owner, { email: 'a@example.com' })

    const referencingCountry = await Segment.create({
      projectId: project.id,
      name: 'Country segment',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: ['country'],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })
    const referencingCompany = await Segment.create({
      projectId: project.id,
      name: 'Company segment',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: ['company'],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })

    await queueRegistry.getQueue('segments').drain(true)
    await listener.handle(new ContactUpdated(contact, owner, ['country']))

    const ids = await pendingSegmentIds()
    assert.include(ids, referencingCountry.id)
    assert.notInclude(ids, referencingCompany.id)
  })
})
