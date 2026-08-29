import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import Segment from '#models/segment'
import SegmentContact from '#models/segment_contact'
import SegmentRecomputeService from '#services/segments/segment_recompute_service'
import CustomFieldDefinitionService from '#services/custom_fields/custom_field_definition_service'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const contactService = new ContactService()
const customFieldDefinitionService = new CustomFieldDefinitionService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

test.group('Segments (functional)', () => {
  test('a member can create a segment', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'French subscribers',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
        },
      })

    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'French subscribers')
      .firstOrFail()
    assert.deepEqual(segment.referencedFields, ['country'])
    assert.equal(segment.lastComputationStatus, 'running')
  })

  test('a viewer cannot create a segment', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ name: 'Nope', definition: { combinator: 'AND', conditions: [] } })

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Nope')
      .first()
    assert.isNull(segment)
  })

  test('an invalid definition (unknown field) is rejected', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Bad',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'notAField', operator: 'equals', value: 'x' }],
        },
      })

    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Bad')
      .first()
    assert.isNull(segment)
  })

  test('an operator incompatible with the field type is rejected', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Bad operator',
        // "email" is a text field: greater_than is not a valid operator for it.
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'email', operator: 'greater_than', value: 'a' }],
        },
      })

    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Bad operator')
      .first()
    assert.isNull(segment)
  })

  test('greater_than on a defined number custom field is accepted and evaluated', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    await customFieldDefinitionService.create(project, { key: 'age', label: 'Age', type: 'number' })
    await contactService.create(project, owner, {
      email: 'a@example.com',
      customFields: { age: 17 },
    })
    await contactService.create(project, owner, {
      email: 'b@example.com',
      customFields: { age: 25 },
    })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Adults',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'customFields.age', operator: 'greater_than', value: 18 }],
        },
      })
    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Adults')
      .firstOrFail()
    assert.deepEqual(segment.referencedFields, ['customFields.age'])

    await new SegmentRecomputeService().full(segment)

    const members = await SegmentContact.query().where('segmentId', segment.id).preload('contact')
    assert.deepEqual(
      members.map((m) => m.contact.email),
      ['b@example.com']
    )
  })

  test('greater_than on an undefined custom field key (no CustomFieldDefinition) is rejected', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Bad custom field operator',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'customFields.age', operator: 'greater_than', value: 18 }],
        },
      })
    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Bad custom field operator')
      .first()
    assert.isNull(segment)
  })

  test('the preview endpoint returns an estimated count without persisting anything', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments/preview`)
      .loginAs(owner)
      .withCsrfToken()
      .json({
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
        },
      })

    response.assertStatus(200)
    response.assertBodyContains({ count: 1 })

    const segmentCount = await Segment.query().withScopes((scopes) => scopes.forProject(project))
    assert.lengthOf(segmentCount, 0)
  })

  test('create -> recompute -> membership is visible in the database', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'French subscribers',
        definition: {
          combinator: 'AND',
          conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
        },
      })
    response.assertStatus(302)

    const segment = await Segment.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'French subscribers')
      .firstOrFail()

    // Simulates the `segments` queue worker picking up the job the request
    // just enqueued (no live worker runs inside the test process).
    await new SegmentRecomputeService().full(segment)

    const members = await SegmentContact.query().where('segmentId', segment.id).preload('contact')
    assert.deepEqual(
      members.map((m) => m.contact.email),
      ['a@example.com']
    )

    await segment.refresh()
    assert.equal(segment.contactCountCache, 1)
    assert.equal(segment.lastComputationStatus, 'success')
  })

  test('a non-member gets a 404 on a project they do not belong to', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/segments`)
      .loginAs(outsider)

    response.assertStatus(404)
  })

  test('segments of one project are invisible from another project', async ({ assert }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })

    await Segment.create({
      projectId: project.id,
      name: 'Only in project A',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: [],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })

    const foundInOtherProject = await Segment.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('name', 'Only in project A')
      .first()

    assert.isNull(foundInOtherProject)
  })

  test('the manual recompute button enqueues a full recompute and flips the status', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const segment = await Segment.create({
      projectId: project.id,
      name: 'Everyone',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: [],
      contactCountCache: 0,
      lastComputationStatus: 'success',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/segments/${segment.id}/recompute`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    await segment.refresh()
    assert.equal(segment.lastComputationStatus, 'running')
  })

  test('deleting a segment removes it', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const segment = await Segment.create({
      projectId: project.id,
      name: 'To delete',
      description: null,
      definition: { combinator: 'AND', conditions: [] },
      referencedFields: [],
      contactCountCache: 0,
      lastComputationStatus: 'idle',
    })

    const response = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}/segments/${segment.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    const found = await Segment.find(segment.id)
    assert.isNull(found)
  })
})
