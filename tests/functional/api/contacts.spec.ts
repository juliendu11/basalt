import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ApiKeyService from '#services/api_keys/api_key_service'
import SegmentService from '#services/segments/segment_service'
import SegmentRecomputeService from '#services/segments/segment_recompute_service'
import SegmentContact from '#models/segment_contact'
import Contact from '#models/contact'
import Tag from '#models/tag'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const apiKeyService = new ApiKeyService()
const segmentService = new SegmentService()

async function createProjectWithKey() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const { token } = await apiKeyService.generate(project, owner, { name: 'Test key' })
  return { owner, organization, project, token }
}

test.group('External API — contacts (functional)', () => {
  test('requests without a token are rejected', async ({ client }) => {
    const response = await client.get('/api/v1/contacts')
    response.assertStatus(401)
  })

  test('requests with an unknown token are rejected', async ({ client }) => {
    const response = await client
      .get('/api/v1/contacts')
      .header('Authorization', 'Bearer mtc_not-a-real-token')
    response.assertStatus(401)
  })

  test('requests with a revoked token are rejected', async ({ client }) => {
    const { project, owner } = await createProjectWithKey()
    const { apiKey, token } = await apiKeyService.generate(project, owner, { name: 'Revoked' })
    await apiKeyService.revoke(apiKey)

    const response = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)
    response.assertStatus(401)
  })

  test('create -> show -> update -> list -> delete', async ({ client, assert }) => {
    const { project, token } = await createProjectWithKey()

    const createResponse = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'new@example.com', firstName: 'Ada' })
    createResponse.assertStatus(201)
    const contactId = createResponse.body().data.id as number

    const showResponse = await client
      .get(`/api/v1/contacts/${contactId}`)
      .header('Authorization', `Bearer ${token}`)
    showResponse.assertStatus(200)
    showResponse.assertBodyContains({ data: { email: 'new@example.com', firstName: 'Ada' } })

    const updateResponse = await client
      .patch(`/api/v1/contacts/${contactId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'new@example.com', firstName: 'Grace' })
    updateResponse.assertStatus(200)
    updateResponse.assertBodyContains({ data: { firstName: 'Grace' } })

    const listResponse = await client
      .get('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
    listResponse.assertStatus(200)
    assert.lengthOf(listResponse.body().data, 1)

    const deleteResponse = await client
      .delete(`/api/v1/contacts/${contactId}`)
      .header('Authorization', `Bearer ${token}`)
    deleteResponse.assertStatus(204)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', contactId)
      .first()
    assert.isNull(contact)
  })

  test('a contact created in another project is invisible to this key', async ({
    client,
    assert,
  }) => {
    const { token } = await createProjectWithKey()
    const other = await createProjectWithKey()

    const otherContact = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ email: 'other@example.com' })
    const otherContactId = otherContact.body().data.id as number

    const response = await client
      .get(`/api/v1/contacts/${otherContactId}`)
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(404)

    const listResponse = await client
      .get('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(listResponse.body().data, 0)
  })

  test('attaching a tag via the API moves the contact into a tag-based segment', async ({
    client,
    assert,
  }) => {
    const { project, token } = await createProjectWithKey()

    const createResponse = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'vip@example.com' })
    const contactId = createResponse.body().data.id as number

    const segment = await segmentService.save(project, {
      name: 'VIPs',
      definition: {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'is_not_null' }],
      },
    })
    assert.deepEqual(segment.referencedFields, ['tags'])
    // `segmentService.save()` doesn't set `contactCountCache` on the
    // in-memory instance (only the DB default does) — refresh before using
    // it with `targeted()`, which increments/decrements it in place.
    await segment.refresh()

    const attachResponse = await client
      .post(`/api/v1/contacts/${contactId}/tags`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'vip' })
    attachResponse.assertStatus(200)
    assert.lengthOf(attachResponse.body().data.tags, 1)
    assert.equal(attachResponse.body().data.tags[0].name, 'vip')

    // Simulates the `segments` queue worker picking up the targeted-recompute
    // job the tag change enqueued (no live worker runs inside the test
    // process) — same convention as tests/functional/segments/segments.spec.ts.
    const contact = await Contact.findOrFail(contactId)
    await new SegmentRecomputeService().targeted(segment, contact)

    const members = await SegmentContact.query().where('segmentId', segment.id)
    assert.lengthOf(members, 1)
    assert.equal(members[0].contactId, contactId)

    const tag = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'vip')
      .firstOrFail()

    const detachResponse = await client
      .delete(`/api/v1/contacts/${contactId}/tags/${tag.id}`)
      .header('Authorization', `Bearer ${token}`)
    detachResponse.assertStatus(200)
    assert.lengthOf(detachResponse.body().data.tags, 0)

    await new SegmentRecomputeService().targeted(segment, contact)
    const remainingMembers = await SegmentContact.query().where('segmentId', segment.id)
    assert.lengthOf(remainingMembers, 0)
  })
})
