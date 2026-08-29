import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import Contact from '#models/contact'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

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
  return { owner, organization, project }
}

test.group('ContactService.create', () => {
  test('creates a subscribed contact', async ({ assert }) => {
    const { owner, project } = await createProject()

    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })

    assert.equal(contact.email, 'jane@example.com')
    assert.equal(contact.status, 'subscribed')
    assert.equal(contact.projectId, project.id)
  })

  test('refuses a duplicate email within the same project', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'jane@example.com' })

    await assert.rejects(
      () => contactService.create(project, owner, { email: 'jane@example.com' }),
      BusinessRuleViolation
    )
  })

  test('allows the same email in a different project', async ({ assert }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await contactService.create(project, owner, { email: 'jane@example.com' })

    const contact = await contactService.create(otherProject, owner, { email: 'jane@example.com' })
    assert.equal(contact.email, 'jane@example.com')
  })
})

test.group('ContactService.update', () => {
  test('emits the list of changed fields', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, {
      email: 'jane@example.com',
      firstName: 'Jane',
    })

    const updated = await contactService.update(contact, owner, {
      email: 'jane@example.com',
      firstName: 'Janet',
      company: 'Acme Inc',
    })

    assert.equal(updated.firstName, 'Janet')
    assert.equal(updated.company, 'Acme Inc')
  })

  test('refuses to change the email to one already used in the project', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'jane@example.com' })
    const contact = await contactService.create(project, owner, { email: 'john@example.com' })

    await assert.rejects(
      () => contactService.update(contact, owner, { email: 'jane@example.com' }),
      BusinessRuleViolation
    )
  })
})

test.group('ContactService.softDelete', () => {
  test('sets deletedAt and excludes the contact from forProject queries', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })

    await contactService.softDelete(contact, owner)

    assert.isNotNull(contact.deletedAt)

    const found = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', contact.id)
      .first()
    assert.isNull(found)
  })
})

test.group('ContactService.changeStatus', () => {
  test('allows subscribed -> unsubscribed', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })

    await contactService.changeStatus(contact, 'unsubscribed')

    assert.equal(contact.status, 'unsubscribed')
  })

  test('allows unsubscribed -> subscribed (manual re-activation)', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'unsubscribed')

    await contactService.changeStatus(contact, 'subscribed')

    assert.equal(contact.status, 'subscribed')
  })

  test('refuses unsubscribed -> bounced', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'unsubscribed')

    await assert.rejects(
      () => contactService.changeStatus(contact, 'bounced'),
      BusinessRuleViolation
    )
  })

  test('refuses blocked -> bounced', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'blocked')

    await assert.rejects(
      () => contactService.changeStatus(contact, 'bounced'),
      BusinessRuleViolation
    )
  })

  // docs/plans/17-unsubscribe.md § Edge cases: a manual/link unsubscribe
  // must reach a contact regardless of which non-subscribed state it's
  // currently in — previously only `-> subscribed` was allowed from these.
  test('allows bounced -> unsubscribed', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'bounced')

    await contactService.changeStatus(contact, 'unsubscribed')

    assert.equal(contact.status, 'unsubscribed')
  })

  test('allows complained -> unsubscribed', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'complained')

    await contactService.changeStatus(contact, 'unsubscribed')

    assert.equal(contact.status, 'unsubscribed')
  })

  test('allows blocked -> unsubscribed', async ({ assert }) => {
    const { owner, project } = await createProject()
    const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
    await contactService.changeStatus(contact, 'blocked')

    await contactService.changeStatus(contact, 'unsubscribed')

    assert.equal(contact.status, 'unsubscribed')
  })
})
