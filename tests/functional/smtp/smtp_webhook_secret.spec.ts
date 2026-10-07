import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const smtpConnectorService = new SmtpConnectorService()

async function createFixtures() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const connector = await smtpConnectorService.create(project, owner, {
    name: 'Relay',
    host: 'localhost',
    port: 1025,
    username: 'u',
    password: 'p',
    encryption: 'none',
    fromEmail: 'hello@acme.test',
    fromName: 'Acme',
  })
  const url = `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${connector.id}/webhook-secret`
  return { owner, organization, project, connector, url }
}

test.group('SMTP webhook secret rotation', () => {
  test('an admin can regenerate the secret; the old URL then stops working', async ({
    client,
    assert,
  }) => {
    const { owner, connector, url } = await createFixtures()
    const oldSecret = connector.webhookSecret

    const response = await client.post(url).loginAs(owner).withCsrfToken().redirects(0)
    response.assertStatus(302)

    await connector.refresh()
    assert.notEqual(connector.webhookSecret, oldSecret)

    const stale = await client
      .post(`/webhooks/smtp/${connector.id}/${oldSecret}`)
      .redirects(0)
      .json({})
    stale.assertStatus(404)

    const fresh = await client
      .post(`/webhooks/smtp/${connector.id}/${connector.webhookSecret}`)
      .redirects(0)
      .json({})
    fresh.assertStatus(200)
  })

  test('a member (non-admin) cannot regenerate the secret', async ({ client, assert }) => {
    const { owner, organization, connector, url } = await createFixtures()
    const oldSecret = connector.webhookSecret
    const member = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: member.email,
      role: 'member',
    })
    await membershipService.accept(invitation, member)

    await client.post(url).loginAs(member).withCsrfToken().redirects(0)

    await connector.refresh()
    assert.equal(connector.webhookSecret, oldSecret)
  })

  test("a user of another organization cannot regenerate a connector's secret", async ({
    client,
    assert,
  }) => {
    const { connector, url } = await createFixtures()
    const oldSecret = connector.webhookSecret
    const outsider = await UserFactory.create()

    await client.post(url).loginAs(outsider).withCsrfToken().redirects(0)

    await connector.refresh()
    assert.equal(connector.webhookSecret, oldSecret)
  })
})
