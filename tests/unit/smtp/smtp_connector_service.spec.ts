import { test } from '@japa/runner'
import encryption from '@adonisjs/core/services/encryption'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import SmtpConnector from '#models/smtp_connector'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const smtpConnectorService = new SmtpConnectorService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

const basePayload = {
  name: 'Primary',
  host: 'smtp.example.com',
  port: 587,
  username: 'user@example.com',
  password: 'super-secret',
  encryption: 'tls' as const,
  fromEmail: 'noreply@example.com',
  fromName: 'Acme',
}

test.group('SmtpConnectorService.create', () => {
  test('encrypts the password (round-trip via decryptedConfig)', async ({ assert }) => {
    const { owner, project } = await createProject()

    const connector = await smtpConnectorService.create(project, owner, basePayload)

    assert.notEqual(connector.passwordEncrypted, basePayload.password)
    assert.equal(smtpConnectorService.decryptedConfig(connector).password, basePayload.password)
  })

  test('the first connector of a project is automatically the default', async ({ assert }) => {
    const { owner, project } = await createProject()

    const connector = await smtpConnectorService.create(project, owner, basePayload)

    assert.isTrue(connector.isDefault)
  })

  test('a second connector is not the default', async ({ assert }) => {
    const { owner, project } = await createProject()
    await smtpConnectorService.create(project, owner, basePayload)

    const second = await smtpConnectorService.create(project, owner, {
      ...basePayload,
      name: 'Secondary',
    })

    assert.isFalse(second.isDefault)
  })
})

test.group('SmtpConnectorService.update', () => {
  test('an empty password preserves the existing one', async ({ assert }) => {
    const { owner, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, basePayload)
    const originalEncrypted = connector.passwordEncrypted

    const updated = await smtpConnectorService.update(connector, owner, {
      ...basePayload,
      password: undefined,
      fromName: 'Acme Updated',
    })

    assert.equal(updated.passwordEncrypted, originalEncrypted)
    assert.equal(updated.fromName, 'Acme Updated')
  })

  test('a new password replaces the existing one', async ({ assert }) => {
    const { owner, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, basePayload)

    const updated = await smtpConnectorService.update(connector, owner, {
      ...basePayload,
      password: 'new-secret',
    })

    assert.equal(smtpConnectorService.decryptedConfig(updated).password, 'new-secret')
  })
})

test.group('SmtpConnectorService — single default per project', () => {
  test('setDefault unsets the previous default', async ({ assert }) => {
    const { owner, project } = await createProject()
    const first = await smtpConnectorService.create(project, owner, basePayload)
    const second = await smtpConnectorService.create(project, owner, {
      ...basePayload,
      name: 'Secondary',
    })

    await smtpConnectorService.setDefault(second, owner)

    await first.refresh()
    await second.refresh()
    assert.isFalse(first.isDefault)
    assert.isTrue(second.isDefault)
  })
})

test.group('SmtpConnectorService.delete', () => {
  test('refuses to delete the default connector while others exist', async ({ assert }) => {
    const { owner, project } = await createProject()
    const first = await smtpConnectorService.create(project, owner, basePayload)
    await smtpConnectorService.create(project, owner, { ...basePayload, name: 'Secondary' })

    await assert.rejects(() => smtpConnectorService.delete(first, owner), BusinessRuleViolation)
  })

  test('allows deleting the only connector of a project', async ({ assert }) => {
    const { owner, project } = await createProject()
    const only = await smtpConnectorService.create(project, owner, basePayload)

    await smtpConnectorService.delete(only, owner)

    const found = await SmtpConnector.find(only.id)
    assert.isNull(found)
  })
})

test.group('SmtpConnectorService — encryption round-trip', () => {
  test('passwordEncrypted is never the plaintext, and decrypts back to it', async ({ assert }) => {
    const { owner, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, basePayload)

    assert.notInclude(connector.passwordEncrypted, basePayload.password)
    assert.equal(encryption.decrypt<string>(connector.passwordEncrypted), basePayload.password)
  })
})
