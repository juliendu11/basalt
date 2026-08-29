import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import IdempotentOperation from '#services/jobs/idempotent_operation'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const idempotentOperation = new IdempotentOperation()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const contact = await contactService.create(project, owner, { email: 'a@example.com' })
  return { project, contact }
}

function insertRow(projectId: number, contactId: number, key: string, status = 'processing') {
  const now = DateTime.now().toSQL({ includeOffset: false })
  return {
    project_id: projectId,
    contact_id: contactId,
    idempotency_key: key,
    status,
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  }
}

test.group('IdempotentOperation', () => {
  test('a brand new key reserves and proceeds', async ({ assert }) => {
    const { project, contact } = await createFixtures()

    const outcome = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: 'exec-1:node-1',
      insertRow: insertRow(project.id, contact.id, 'exec-1:node-1'),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })

    assert.equal(outcome.action, 'proceed')
    if (outcome.action === 'proceed') assert.isFalse(outcome.resumed)
  })

  test('a duplicate reservation on a terminal row is skipped', async ({ assert }) => {
    const { project, contact } = await createFixtures()
    const key = 'exec-2:node-1'

    const first = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })
    if (first.action !== 'proceed') throw new Error('expected proceed')

    const completed = await idempotentOperation.complete(
      'email_deliveries',
      first.rowId,
      'processing',
      {
        status: 'sent',
        sent_at: DateTime.now().toSQL({ includeOffset: false }),
      }
    )
    assert.isTrue(completed)

    const second = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })

    assert.equal(second.action, 'skip')
    if (second.action === 'skip') assert.equal(second.reason, 'terminal')
  })

  test('a duplicate reservation on a fresh in-flight row is skipped, not resumed', async ({
    assert,
  }) => {
    const { project, contact } = await createFixtures()
    const key = 'exec-3:node-1'

    const first = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })
    assert.equal(first.action, 'proceed')

    const second = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })

    assert.equal(second.action, 'skip')
    if (second.action === 'skip') assert.equal(second.reason, 'in_flight')
  })

  test('a stale in-flight row is resumed rather than skipped', async ({ assert }) => {
    const { project, contact } = await createFixtures()
    const key = 'exec-4:node-1'

    const staleRow = insertRow(project.id, contact.id, key)
    staleRow.updated_at = DateTime.now().minus({ minutes: 10 }).toSQL({ includeOffset: false })!
    staleRow.created_at = staleRow.updated_at
    await db.table('email_deliveries').insert(staleRow)

    const outcome = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
      stalenessMinutes: 5,
    })

    assert.equal(outcome.action, 'proceed')
    if (outcome.action === 'proceed') assert.isTrue(outcome.resumed)
  })

  test('complete() is a no-op (returns false) if the row is no longer in-flight', async ({
    assert,
  }) => {
    const { project, contact } = await createFixtures()
    const key = 'exec-5:node-1'

    const first = await idempotentOperation.reserve({
      table: 'email_deliveries',
      idempotencyKey: key,
      insertRow: insertRow(project.id, contact.id, key),
      inFlightStatus: 'processing',
      terminalStatuses: ['sent', 'failed'],
    })
    if (first.action !== 'proceed') throw new Error('expected proceed')

    await idempotentOperation.complete('email_deliveries', first.rowId, 'processing', {
      status: 'sent',
    })

    const secondComplete = await idempotentOperation.complete(
      'email_deliveries',
      first.rowId,
      'processing',
      { status: 'sent' }
    )
    assert.isFalse(secondComplete)
  })

  test('two concurrent reserves for the same key: exactly one proceeds fresh', async ({
    assert,
  }) => {
    const { project, contact } = await createFixtures()
    const key = 'exec-6:node-1'

    const [a, b] = await Promise.all([
      idempotentOperation.reserve({
        table: 'email_deliveries',
        idempotencyKey: key,
        insertRow: insertRow(project.id, contact.id, key),
        inFlightStatus: 'processing',
        terminalStatuses: ['sent', 'failed'],
      }),
      idempotentOperation.reserve({
        table: 'email_deliveries',
        idempotencyKey: key,
        insertRow: insertRow(project.id, contact.id, key),
        inFlightStatus: 'processing',
        terminalStatuses: ['sent', 'failed'],
      }),
    ])

    const freshProceeds = [a, b].filter((o) => o.action === 'proceed' && !o.resumed)
    assert.lengthOf(freshProceeds, 1)
  })
})
