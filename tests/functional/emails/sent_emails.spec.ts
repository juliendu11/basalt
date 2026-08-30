import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import CampaignService from '#services/campaigns/campaign_service'
import EmailService from '#services/emails/email_service'
import EmailDelivery from '#models/email_delivery'
import EmailEvent from '#models/email_event'
import SentEmailsService from '#services/emails/sent_emails_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const campaignService = new CampaignService()
const emailService = new EmailService()
const sentEmails = new SentEmailsService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'a@example.com' })
  const other = await contactService.create(project, owner, { email: 'b@example.com' })
  const campaign = await campaignService.create(project, owner, { name: 'Onboarding' })
  const email = await emailService.create(project, owner, {
    name: 'Welcome',
    subject: 'Welcome aboard',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>Hi!</p>',
  })
  return { owner, project, contact, other, campaign, email }
}

test.group('SentEmailsService.forContact', () => {
  test('returns the contact sent deliveries oldest-first with campaign, subject and engagement', async ({
    assert,
  }) => {
    const { project, contact, campaign, email } = await createFixtures()

    const older = await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      contactId: contact.id,
      emailId: email.id,
      idempotencyKey: 'k-older',
      status: 'delivered',
      sentAt: DateTime.now().minus({ days: 3 }),
      deliveredAt: DateTime.now().minus({ days: 3 }).plus({ minutes: 1 }),
    })
    const newer = await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      contactId: contact.id,
      emailId: email.id,
      idempotencyKey: 'k-newer',
      status: 'sent',
      sentAt: DateTime.now().minus({ days: 1 }),
    })

    await EmailEvent.create({
      projectId: project.id,
      emailDeliveryId: older.id,
      contactId: contact.id,
      type: 'opened',
      occurredAt: DateTime.now().minus({ days: 3 }).plus({ hours: 2 }),
    })
    await EmailEvent.create({
      projectId: project.id,
      emailDeliveryId: older.id,
      contactId: contact.id,
      type: 'opened',
      occurredAt: DateTime.now().minus({ days: 2 }),
    })
    await EmailEvent.create({
      projectId: project.id,
      emailDeliveryId: older.id,
      contactId: contact.id,
      type: 'clicked',
      occurredAt: DateTime.now().minus({ days: 3 }).plus({ hours: 3 }),
    })

    const result = await sentEmails.forContact(contact)

    assert.lengthOf(result, 2)
    assert.deepEqual(
      result.map((r) => r.deliveryId),
      [older.id, newer.id]
    )
    assert.equal(result[0].subject, 'Welcome aboard')
    assert.equal(result[0].campaignName, 'Onboarding')
    assert.equal(result[0].status, 'delivered')
    assert.isNotNull(result[0].openedAt)
    assert.isNotNull(result[0].clickedAt)
    // earliest open wins
    assert.isBelow(
      Math.abs(
        result[0].openedAt!.diff(DateTime.now().minus({ days: 3 }).plus({ hours: 2 })).as('minutes')
      ),
      1
    )
    assert.isNull(result[1].openedAt)
    assert.isNull(result[1].clickedAt)
  })

  test('never-sent deliveries and other contacts deliveries are excluded', async ({ assert }) => {
    const { project, contact, other, campaign, email } = await createFixtures()

    await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      contactId: contact.id,
      emailId: email.id,
      idempotencyKey: 'k-queued',
      status: 'queued',
      sentAt: null,
    })
    await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      contactId: other.id,
      emailId: email.id,
      idempotencyKey: 'k-other',
      status: 'sent',
      sentAt: DateTime.now().minus({ hours: 1 }),
    })

    assert.lengthOf(await sentEmails.forContact(contact), 0)
  })
})

test.group('SentEmailsService.forCampaign', () => {
  test('paginates the campaign deliveries newest-first, across contacts, with engagement', async ({
    assert,
  }) => {
    const { project, contact, other, campaign, email } = await createFixtures()

    const deliveries = []
    for (let i = 0; i < 3; i++) {
      deliveries.push(
        await EmailDelivery.create({
          projectId: project.id,
          campaignId: campaign.id,
          contactId: i % 2 === 0 ? contact.id : other.id,
          emailId: email.id,
          idempotencyKey: `k-${i}`,
          status: 'sent',
          sentAt: DateTime.now().minus({ hours: 3 - i }),
        })
      )
    }

    await EmailEvent.create({
      projectId: project.id,
      emailDeliveryId: deliveries[2].id,
      contactId: contact.id,
      type: 'clicked',
      occurredAt: DateTime.now().minus({ minutes: 30 }),
    })

    const first = await sentEmails.forCampaign(campaign, 1, 2)
    assert.lengthOf(first.data, 2)
    assert.isTrue(first.hasMore)
    // newest first
    assert.deepEqual(
      first.data.map((r) => r.deliveryId),
      [deliveries[2].id, deliveries[1].id]
    )
    assert.equal(first.data[0].contactEmail, 'a@example.com')
    assert.equal(first.data[0].campaignName, 'Onboarding')
    assert.isNotNull(first.data[0].clickedAt)

    const second = await sentEmails.forCampaign(campaign, 2, 2)
    assert.lengthOf(second.data, 1)
    assert.isFalse(second.hasMore)
    assert.equal(second.data[0].deliveryId, deliveries[0].id)
  })

  test('never-sent deliveries and other campaigns deliveries are excluded', async ({ assert }) => {
    const { owner, project, contact, campaign, email } = await createFixtures()
    const otherCampaign = await campaignService.create(project, owner, { name: 'Other' })

    await EmailDelivery.create({
      projectId: project.id,
      campaignId: campaign.id,
      contactId: contact.id,
      emailId: email.id,
      idempotencyKey: 'k-queued',
      status: 'queued',
      sentAt: null,
    })
    await EmailDelivery.create({
      projectId: project.id,
      campaignId: otherCampaign.id,
      contactId: contact.id,
      emailId: email.id,
      idempotencyKey: 'k-other-campaign',
      status: 'sent',
      sentAt: DateTime.now().minus({ hours: 1 }),
    })

    const result = await sentEmails.forCampaign(campaign)
    assert.lengthOf(result.data, 0)
    assert.isFalse(result.hasMore)
  })
})
