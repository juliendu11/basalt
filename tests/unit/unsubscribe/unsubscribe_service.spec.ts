import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import UnsubscribeService from '#services/unsubscribe/unsubscribe_service'
import UnsubscribeTokenService from '#services/unsubscribe/unsubscribe_token_service'
import ContactUnsubscribeEvent from '#models/contact_unsubscribe_event'
import UnsubscribeToken from '#models/unsubscribe_token'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const unsubscribeService = new UnsubscribeService()
const unsubscribeTokenService = new UnsubscribeTokenService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'jane@example.com' })
  return { owner, project, contact }
}

test.group('UnsubscribeService.unsubscribe', () => {
  test('moves a subscribed contact to unsubscribed and journals an event', async ({ assert }) => {
    const { contact } = await createFixtures()

    const updated = await unsubscribeService.unsubscribe(contact, 'link')

    assert.equal(updated.status, 'unsubscribed')
    const events = await ContactUnsubscribeEvent.query().where('contactId', contact.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0].source, 'link')
  })

  test('is idempotent on status but journals every call', async ({ assert }) => {
    const { contact } = await createFixtures()

    await unsubscribeService.unsubscribe(contact, 'link')
    const secondCall = await unsubscribeService.unsubscribe(contact, 'link')

    assert.equal(secondCall.status, 'unsubscribed')
    const events = await ContactUnsubscribeEvent.query().where('contactId', contact.id)
    assert.lengthOf(events, 2)
  })

  test('reaches unsubscribed from bounced/complained/blocked (not just subscribed)', async ({
    assert,
  }) => {
    for (const startingStatus of ['bounced', 'complained', 'blocked'] as const) {
      const { contact } = await createFixtures()
      await contactService.changeStatus(contact, startingStatus)

      const updated = await unsubscribeService.unsubscribe(contact, 'manual')

      assert.equal(updated.status, 'unsubscribed')
    }
  })
})

test.group('UnsubscribeService.resubscribe', () => {
  test('moves an unsubscribed contact back to subscribed', async ({ assert }) => {
    const { owner, contact } = await createFixtures()
    await unsubscribeService.unsubscribe(contact, 'link')

    const updated = await unsubscribeService.resubscribe(contact, owner.id)

    assert.equal(updated.status, 'subscribed')
  })
})

test.group('UnsubscribeTokenService.getOrCreate', () => {
  test('reuses an existing token rather than creating a second one', async ({ assert }) => {
    const { project, contact } = await createFixtures()

    const first = await unsubscribeTokenService.getOrCreate(project, contact)
    const second = await unsubscribeTokenService.getOrCreate(project, contact)

    assert.equal(first.id, second.id)
    assert.equal(first.token, second.token)

    const rows = await UnsubscribeToken.query()
      .where('projectId', project.id)
      .where('contactId', contact.id)
    assert.lengthOf(rows, 1)
  })

  test('two near-simultaneous calls for a never-before-tokenized contact resolve to the same row', async ({
    assert,
  }) => {
    const { project, contact } = await createFixtures()

    const [first, second] = await Promise.all([
      unsubscribeTokenService.getOrCreate(project, contact),
      unsubscribeTokenService.getOrCreate(project, contact),
    ])

    assert.equal(first.token, second.token)

    const rows = await UnsubscribeToken.query()
      .where('projectId', project.id)
      .where('contactId', contact.id)
    assert.lengthOf(rows, 1)
  })
})

test.group('UnsubscribeTokenService.resolve', () => {
  test('resolves a valid token to its contact', async ({ assert }) => {
    const { project, contact } = await createFixtures()
    const token = await unsubscribeTokenService.getOrCreate(project, contact)

    const resolved = await unsubscribeTokenService.resolve(token.token)

    assert.isNotNull(resolved)
    assert.equal(resolved?.id, contact.id)
  })

  test('returns null for an unknown token, never throws', async ({ assert }) => {
    const resolved = await unsubscribeTokenService.resolve('this-token-does-not-exist')

    assert.isNull(resolved)
  })
})
