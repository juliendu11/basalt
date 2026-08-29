import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'

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

test.group('SMTP connection test (functional)', () => {
  /**
   * Mailcatcher (docker-compose.dev.yml, SMTP on :1025) doesn't advertise
   * SMTP AUTH in its EHLO response, but Nodemailer's `verify()` still
   * succeeds against it (no auth negotiation is forced when the server
   * doesn't offer any AUTH mechanism) — confirmed empirically before
   * writing this test.
   */
  test('testing unsaved form parameters against a reachable server succeeds', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/smtp/test`)
      .loginAs(owner)
      .withCsrfToken()
      .json({
        host: 'localhost',
        port: 1025,
        username: 'user@example.com',
        password: 'whatever',
        encryption: 'none',
      })

    response.assertStatus(200)
    assert.isTrue(response.body().success)
  })

  test('testing against an unreachable host fails cleanly', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/smtp/test`)
      .loginAs(owner)
      .withCsrfToken()
      .json({
        host: '127.0.0.1',
        port: 1,
        username: 'user@example.com',
        password: 'whatever',
        encryption: 'none',
      })

    response.assertStatus(200)
    assert.isFalse(response.body().success)
    assert.isString(response.body().message)
  })

  test('testing an existing connector records last_tested_at/last_test_status', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, {
      name: 'Primary',
      host: 'localhost',
      port: 1025,
      username: 'user@example.com',
      password: 'whatever',
      encryption: 'none',
      fromEmail: 'noreply@example.com',
      fromName: 'Acme',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${connector.id}/test`
      )
      .loginAs(owner)
      .withCsrfToken()
    response.assertStatus(200)
    assert.isTrue(response.body().success)

    await connector.refresh()
    assert.isNotNull(connector.lastTestedAt)
    assert.equal(connector.lastTestStatus, 'success')
  })
})
