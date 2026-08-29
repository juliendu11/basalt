import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import ContactTagService from '#services/contacts/contact_tag_service'
import Segment from '#models/segment'
import queueRegistry from '#services/jobs/queue_registry'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const contactTagService = new ContactTagService()

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

test.group('ContactTagService', (group) => {
  group.each.setup(async () => {
    await queueRegistry.getQueue('segments').drain(true)
  })

  test('attach creates the tag on the fly and dispatches ContactUpdated(["tags"])', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'a@example.com' })
    const tagSegment = await Segment.create({
      projectId: project.id,
      name: 'Tagged',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: ['tags'],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })
    await queueRegistry.getQueue('segments').drain(true)

    const tag = await contactTagService.attach(project, contact, owner, 'vip')

    assert.equal(tag.name, 'vip')
    assert.equal(tag.projectId, project.id)
    await contact.load('tags')
    assert.deepEqual(
      contact.tags.map((t) => t.id),
      [tag.id]
    )

    const ids = await pendingSegmentIds()
    assert.include(ids, tagSegment.id)
  })

  test('attach reuses an existing tag with the same name', async ({ assert }) => {
    const { owner, project } = await createProject()
    const a = await contactService.create(project, owner, { email: 'a@example.com' })
    const b = await contactService.create(project, owner, { email: 'b@example.com' })

    const first = await contactTagService.attach(project, a, owner, 'vip')
    const second = await contactTagService.attach(project, b, owner, 'vip')

    assert.equal(first.id, second.id)
  })

  test('detach removes the tag and dispatches ContactUpdated(["tags"])', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'a@example.com' })
    const tag = await contactTagService.attach(project, contact, owner, 'vip')
    const tagSegment = await Segment.create({
      projectId: project.id,
      name: 'Tagged',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: ['tags'],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })
    await queueRegistry.getQueue('segments').drain(true)

    await contactTagService.detach(contact, owner, tag.id)

    await contact.load('tags')
    assert.lengthOf(contact.tags, 0)

    const ids = await pendingSegmentIds()
    assert.include(ids, tagSegment.id)
  })
})
