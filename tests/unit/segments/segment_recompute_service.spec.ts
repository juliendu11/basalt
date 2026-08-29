import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import Segment from '#models/segment'
import SegmentContact from '#models/segment_contact'
import SegmentRecomputeService from '#services/segments/segment_recompute_service'
import type { SegmentDefinition } from '#types/segment_definition'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, project }
}

async function createSegment(projectId: number, definition: SegmentDefinition) {
  return Segment.create({
    projectId,
    name: 'Test segment',
    description: null,
    definition,
    referencedFields: [],
    contactCountCache: 0,
    lastComputationStatus: 'idle',
  })
}

async function memberEmails(segmentId: number): Promise<string[]> {
  const rows = await SegmentContact.query().where('segmentId', segmentId).preload('contact')
  return rows.map((row) => row.contact.email).sort()
}

test.group('SegmentRecomputeService.full', () => {
  test('inserts matching contacts and updates cache/status', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })

    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService()
    await service.full(segment)

    assert.deepEqual(await memberEmails(segment.id), ['a@example.com'])
    await segment.refresh()
    assert.equal(segment.contactCountCache, 1)
    assert.equal(segment.lastComputationStatus, 'success')
    assert.isNotNull(segment.lastComputedAt)
  })

  test('idempotent: running twice with no contact changes adds/removes nothing the second time', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService()
    await service.full(segment)
    const firstRun = await memberEmails(segment.id)

    await service.full(segment)
    const secondRun = await memberEmails(segment.id)

    assert.deepEqual(firstRun, secondRun)
    assert.deepEqual(secondRun, ['a@example.com'])
  })

  test('simultaneous adds and removes are diffed correctly in both directions', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    const b = await contactService.create(project, owner, {
      email: 'b@example.com',
      country: 'France',
    })

    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })
    const service = new SegmentRecomputeService()
    await service.full(segment)
    assert.deepEqual(await memberEmails(segment.id), ['a@example.com', 'b@example.com'])

    await contactService.update(b, owner, { email: b.email, country: 'Spain' })
    await contactService.create(project, owner, { email: 'c@example.com', country: 'France' })

    await service.full(segment)

    assert.deepEqual(await memberEmails(segment.id), ['a@example.com', 'c@example.com'])
  })

  test('batches reads in small chunks and still produces correct final membership', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    for (let i = 0; i < 5; i += 1) {
      await contactService.create(project, owner, { email: `c${i}@example.com`, country: 'France' })
    }
    await contactService.create(project, owner, { email: 'nope@example.com', country: 'Spain' })

    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService(2)
    await service.full(segment)

    assert.deepEqual(await memberEmails(segment.id), [
      'c0@example.com',
      'c1@example.com',
      'c2@example.com',
      'c3@example.com',
      'c4@example.com',
    ])
    await segment.refresh()
    assert.equal(segment.contactCountCache, 5)
  })

  test('an empty definition matches every contact of the project', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com' })
    await contactService.create(project, owner, { email: 'b@example.com' })

    const segment = await createSegment(project.id, { combinator: 'AND', conditions: [] })
    const service = new SegmentRecomputeService()
    await service.full(segment)

    assert.deepEqual(await memberEmails(segment.id), ['a@example.com', 'b@example.com'])
  })
})

test.group('SegmentRecomputeService.targeted', () => {
  test('adds a contact that newly matches', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, {
      email: 'a@example.com',
      country: 'Spain',
    })
    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService()
    await service.targeted(segment, contact)
    assert.deepEqual(await memberEmails(segment.id), [])

    await contactService.update(contact, owner, { email: contact.email, country: 'France' })
    await service.targeted(segment, contact)

    assert.deepEqual(await memberEmails(segment.id), ['a@example.com'])
    await segment.refresh()
    assert.equal(segment.contactCountCache, 1)
  })

  test('removes a contact that no longer matches', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, {
      email: 'a@example.com',
      country: 'France',
    })
    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService()
    await service.full(segment)
    assert.deepEqual(await memberEmails(segment.id), ['a@example.com'])

    await contactService.update(contact, owner, { email: contact.email, country: 'Spain' })
    await service.targeted(segment, contact)

    assert.deepEqual(await memberEmails(segment.id), [])
    await segment.refresh()
    assert.equal(segment.contactCountCache, 0)
  })

  test('is a no-op when membership does not change', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, {
      email: 'a@example.com',
      country: 'France',
    })
    const segment = await createSegment(project.id, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    const service = new SegmentRecomputeService()
    await service.full(segment)
    await segment.refresh()
    const countAfterFull = segment.contactCountCache

    await service.targeted(segment, contact)
    await segment.refresh()

    assert.equal(segment.contactCountCache, countAfterFull)
    assert.deepEqual(await memberEmails(segment.id), ['a@example.com'])
  })
})
