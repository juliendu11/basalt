import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import StatisticsService, { resolvePeriod } from '#services/statistics/statistics_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const statisticsService = new StatisticsService()

async function fixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  await contactService.create(project, owner, { email: 'jean@example.com' })
  return { owner, project }
}

async function insertDailyStat(
  projectId: number,
  date: DateTime,
  overrides: Partial<{ sent: number; opened: number }>
) {
  const now = DateTime.now().toSQL({ includeOffset: false })
  await db.table('project_daily_stats').insert({
    project_id: projectId,
    date: date.toISODate()!,
    contacts_total: 1,
    contacts_active: 1,
    emails_sent: overrides.sent ?? 0,
    emails_delivered: 0,
    emails_opened: overrides.opened ?? 0,
    emails_clicked: 0,
    emails_bounced: 0,
    emails_failed: 0,
    unsubscribes: 0,
    created_at: now,
    updated_at: now,
  })
}

test.group('StatisticsService.projectSummary', () => {
  test('resolvePeriod: presets resolve to the expected ranges', ({ assert }) => {
    const today = DateTime.now().toISODate()!

    assert.deepEqual(resolvePeriod('today'), { from: today, to: today })

    const last7 = resolvePeriod('last_7_days')
    assert.equal(last7.to, today)
    assert.equal(DateTime.fromISO(last7.from).diff(DateTime.fromISO(today), 'days').days, -6)
  })

  test('sums pre-aggregated past days with real-time "today", never averaging per-day ratios', async ({
    assert,
  }) => {
    const { project } = await fixtures()

    // Day 1: high volume, low open rate (100 sent, 10 opened -> 10%).
    // Day 2: low volume, high open rate (2 sent, 2 opened -> 100%).
    // Naive average-of-ratios would give (10% + 100%) / 2 = 55% — wrong.
    // Correct sum-then-divide: (10 + 2) / (100 + 2) = 11.76%.
    const day1 = DateTime.now().minus({ days: 3 }).startOf('day')
    const day2 = DateTime.now().minus({ days: 2 }).startOf('day')
    await insertDailyStat(project.id, day1, { sent: 100, opened: 10 })
    await insertDailyStat(project.id, day2, { sent: 2, opened: 2 })

    const summary = await statisticsService.projectSummary(project, {
      from: day1.toISODate()!,
      to: day2.toISODate()!,
    })

    assert.equal(summary.sent, 102)
    assert.equal(summary.opened, 12)
    assert.approximately(summary.openRate, 12 / 102, 0.0001)
    // The wrong, naive-average-of-ratios answer would be ~0.55 — far from
    // the correct sum-then-divide result, proving the right path ran.
    assert.isAbove(Math.abs(summary.openRate - 0.55), 0.05)
  })

  test('a period including today adds the live real-time count on top of pre-aggregated days', async ({
    assert,
  }) => {
    const { project, owner } = await fixtures()

    const yesterday = DateTime.now().minus({ days: 1 }).startOf('day')
    await insertDailyStat(project.id, yesterday, { sent: 5, opened: 1 })

    const contact = await contactService.create(project, owner, { email: 'today@example.com' })
    const now = DateTime.now().toSQL({ includeOffset: false })
    await db.table('email_deliveries').insert({
      project_id: project.id,
      contact_id: contact.id,
      idempotency_key: 'exec-today:node-today',
      status: 'sent',
      created_at: now,
      updated_at: now,
    })

    const summary = await statisticsService.projectSummary(project, {
      from: yesterday.toISODate()!,
      to: DateTime.now().toISODate()!,
    })

    // 5 from yesterday's pre-aggregated row + 1 from today's real-time count.
    assert.equal(summary.sent, 6)
    assert.equal(summary.contactsTotal, 2) // live count, includes today's new contact
  })

  test('a period entirely in the past never queries real-time deliveries', async ({ assert }) => {
    const { project } = await fixtures()
    const day = DateTime.now().minus({ days: 5 }).startOf('day')
    await insertDailyStat(project.id, day, { sent: 3, opened: 1 })

    const summary = await statisticsService.projectSummary(project, {
      from: day.toISODate()!,
      to: day.toISODate()!,
    })

    assert.equal(summary.sent, 3)
    assert.equal(summary.opened, 1)
  })
})
