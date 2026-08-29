import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import CampaignService from '#services/campaigns/campaign_service'
import StatisticsAggregationService from '#services/statistics/statistics_aggregation_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const campaignService = new CampaignService()
const aggregationService = new StatisticsAggregationService()

async function fixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, {
    email: 'jean@example.com',
  })
  const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
  return { owner, project, contact, campaign }
}

function sqlAt(date: DateTime): string {
  return date.toSQL({ includeOffset: false })!
}

test.group('StatisticsAggregationService.aggregateDailyStats', () => {
  test('counts deliveries/events/unsubscribes for the given date, scoped to project and campaign', async ({
    assert,
  }) => {
    const { project, contact, campaign } = await fixtures()
    const day = DateTime.now().minus({ days: 2 }).startOf('day')

    // Two deliveries: one 'sent', one 'bounced' — both created on `day`.
    const [sentId] = await db.table('email_deliveries').insert({
      project_id: project.id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      idempotency_key: 'exec1:node1',
      status: 'sent',
      created_at: sqlAt(day),
      updated_at: sqlAt(day),
    })
    await db.table('email_deliveries').insert({
      project_id: project.id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      idempotency_key: 'exec2:node1',
      status: 'bounced',
      created_at: sqlAt(day),
      updated_at: sqlAt(day),
    })

    // Two 'opened' events for the SAME delivery — must count as ONE unique open.
    await db.table('email_events').insert([
      {
        project_id: project.id,
        email_delivery_id: sentId,
        contact_id: contact.id,
        type: 'opened',
        occurred_at: sqlAt(day),
      },
      {
        project_id: project.id,
        email_delivery_id: sentId,
        contact_id: contact.id,
        type: 'opened',
        occurred_at: sqlAt(day),
      },
    ])

    await db.table('contact_unsubscribe_events').insert({
      project_id: project.id,
      contact_id: contact.id,
      campaign_id: campaign.id,
      source: 'link',
      occurred_at: sqlAt(day),
    })

    await aggregationService.aggregateDailyStats(day)

    const projectRow = await db
      .from('project_daily_stats')
      .where('project_id', project.id)
      .where('date', day.toISODate()!)
      .first()
    assert.equal(projectRow.emails_sent, 1)
    assert.equal(projectRow.emails_bounced, 1)
    assert.equal(projectRow.emails_opened, 1) // unique, not 2
    assert.equal(projectRow.unsubscribes, 1)
    assert.equal(projectRow.contacts_total, 1)
    assert.equal(projectRow.contacts_active, 1)

    const campaignRow = await db
      .from('campaign_daily_stats')
      .where('campaign_id', campaign.id)
      .where('date', day.toISODate()!)
      .first()
    assert.equal(campaignRow.sent, 1)
    assert.equal(campaignRow.bounced, 1)
    assert.equal(campaignRow.opened, 1)
    assert.equal(campaignRow.unsubscribed, 1)
  })

  test('is idempotent: running twice for the same date produces the same row, not doubled counts', async ({
    assert,
  }) => {
    const { project, contact, campaign } = await fixtures()
    const day = DateTime.now().minus({ days: 3 }).startOf('day')

    await db.table('email_deliveries').insert({
      project_id: project.id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      idempotency_key: 'exec3:node1',
      status: 'sent',
      created_at: sqlAt(day),
      updated_at: sqlAt(day),
    })

    await aggregationService.aggregateDailyStats(day)
    await aggregationService.aggregateDailyStats(day)

    const rows = await db
      .from('project_daily_stats')
      .where('project_id', project.id)
      .where('date', day.toISODate()!)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].emails_sent, 1)

    const campaignRows = await db
      .from('campaign_daily_stats')
      .where('campaign_id', campaign.id)
      .where('date', day.toISODate()!)
    assert.lengthOf(campaignRows, 1)
    assert.equal(campaignRows[0].sent, 1)
  })
})
