import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import TrackingEventService from '#services/tracking/tracking_event_service'
import EmailDelivery from '#models/email_delivery'
import EmailEvent from '#models/email_event'
import Contact from '#models/contact'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const trackingEventService = new TrackingEventService()

async function createDelivery(status: 'processing' | 'sent' | 'bounced' | 'failed' = 'sent') {
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
    status,
  })

  return { project, contact, delivery }
}

test.group('TrackingEventService.processEvent', () => {
  test('an unknown delivery id is a silent no-op', async ({ assert }) => {
    await trackingEventService.processEvent({ deliveryId: 999_999, type: 'opened' })
    const events = await EmailEvent.query()
    assert.lengthOf(events, 0)
  })

  test('records an append-only email_events row for every event type', async ({ assert }) => {
    const { delivery } = await createDelivery()

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'opened' })
    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'opened' })

    const events = await EmailEvent.query().where('emailDeliveryId', delivery.id)
    assert.lengthOf(events, 2) // never deduplicated
  })

  test("'delivered' moves the delivery status forward and sets deliveredAt", async ({ assert }) => {
    const { delivery } = await createDelivery('sent')

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'delivered' })

    await delivery.refresh()
    assert.equal(delivery.status, 'delivered')
    assert.isNotNull(delivery.deliveredAt)
  })

  test('a terminal delivery status is never regressed by a later event', async ({ assert }) => {
    const { delivery } = await createDelivery('bounced')

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'delivered' })

    await delivery.refresh()
    assert.equal(delivery.status, 'bounced')
  })

  test('a hard bounce moves the contact to bounced', async ({ assert }) => {
    const { contact, delivery } = await createDelivery('sent')

    await trackingEventService.processEvent({
      deliveryId: delivery.id,
      type: 'bounced',
      metadata: { bounceType: 'hard' },
    })

    const refreshed = await Contact.findOrFail(contact.id)
    assert.equal(refreshed.status, 'bounced')

    await delivery.refresh()
    assert.equal(delivery.status, 'bounced')
  })

  test('a soft bounce (or unspecified bounceType) does not change the contact status', async ({
    assert,
  }) => {
    const { contact, delivery } = await createDelivery('sent')

    await trackingEventService.processEvent({
      deliveryId: delivery.id,
      type: 'bounced',
      metadata: { bounceType: 'soft' },
    })

    const refreshed = await Contact.findOrFail(contact.id)
    assert.equal(refreshed.status, 'subscribed')

    const untyped = await createDelivery('sent')
    await trackingEventService.processEvent({ deliveryId: untyped.delivery.id, type: 'bounced' })
    const refreshedUntyped = await Contact.findOrFail(untyped.contact.id)
    assert.equal(refreshedUntyped.status, 'subscribed')
  })

  test('a complaint moves the contact to complained', async ({ assert }) => {
    const { contact, delivery } = await createDelivery('sent')

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'complained' })

    const refreshed = await Contact.findOrFail(contact.id)
    assert.equal(refreshed.status, 'complained')
  })

  test('an invalid contact status transition is swallowed, never thrown', async ({ assert }) => {
    const { contact, delivery } = await createDelivery('sent')
    await contactService.changeStatus(contact, 'unsubscribed')

    // unsubscribed -> bounced is not an allowed Contact status transition
    // (docs/plans/05-contacts.md) — this must not throw.
    await trackingEventService.processEvent({
      deliveryId: delivery.id,
      type: 'bounced',
      metadata: { bounceType: 'hard' },
    })

    const refreshed = await Contact.findOrFail(contact.id)
    assert.equal(refreshed.status, 'unsubscribed')
  })

  test("'unsubscribed' is recorded but has no other effect (deferred to a later phase)", async ({
    assert,
  }) => {
    const { contact, delivery } = await createDelivery('sent')

    await trackingEventService.processEvent({ deliveryId: delivery.id, type: 'unsubscribed' })

    const events = await EmailEvent.query().where('emailDeliveryId', delivery.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0].type, 'unsubscribed')

    const refreshed = await Contact.findOrFail(contact.id)
    assert.equal(refreshed.status, 'subscribed')

    await delivery.refresh()
    assert.equal(delivery.status, 'sent')
  })
})
