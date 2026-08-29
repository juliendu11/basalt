import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import SmtpConnectorTransformer from '#transformers/smtp_connector_transformer'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const smtpConnectorService = new SmtpConnectorService()

test.group('SmtpConnectorTransformer', () => {
  test('never includes password or passwordEncrypted in its output', async ({ assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Marketing',
      timezone: 'Europe/Paris',
    })
    const connector = await smtpConnectorService.create(project, owner, {
      name: 'Primary',
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'super-secret',
      encryption: 'tls',
      fromEmail: 'noreply@example.com',
      fromName: 'Acme',
    })

    // `.transform()` returns a lazy `Item` wrapper that still closes over the
    // raw model (see `transformerData`) — only `.resolve()` (what `ctx.serialize()`
    // calls under the hood) actually applies `toObject()`'s allowlist. Asserting
    // on the unresolved `Item`/its naive `JSON.stringify()` would trivially "pass"
    // while a real leak through `toObject()` goes undetected.
    const resolver = app.container.createResolver()
    const output = (await SmtpConnectorTransformer.transform(connector).resolve(
      resolver,
      0
    )) as Record<string, unknown>

    assert.notProperty(output, 'password')
    assert.notProperty(output, 'passwordEncrypted')
    assert.notInclude(JSON.stringify(output), 'super-secret')
    assert.notInclude(JSON.stringify(output), connector.passwordEncrypted)
  })
})
