import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import SmtpConnector from '#models/smtp_connector'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
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

const formPayload = {
  name: 'Primary',
  host: 'smtp.example.com',
  port: 587,
  username: 'user@example.com',
  password: 'super-secret',
  encryption: 'tls' as const,
  fromEmail: 'noreply@example.com',
  fromName: 'Acme',
}

test.group('SMTP connectors (functional)', () => {
  test('an admin can create a connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/smtp`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    response.assertStatus(302)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Primary')
      .firstOrFail()
    assert.isTrue(connector.isDefault)
  })

  test('a member cannot create a connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const member = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: member.email,
      role: 'member',
    })
    await membershipService.accept(invitation, member)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/settings/smtp`)
      .loginAs(member)
      .withCsrfToken()
      .redirects(0)
      .json(formPayload)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Primary')
      .first()
    assert.isNull(connector)
  })

  test('a viewer cannot edit a connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, formPayload)

    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .patch(
        `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${connector.id}`
      )
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ ...formPayload, fromName: 'Hacked' })

    await connector.refresh()
    assert.equal(connector.fromName, 'Acme')
  })

  test('an admin can update and delete a connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const connector = await smtpConnectorService.create(project, owner, formPayload)

    const updateResponse = await client
      .patch(
        `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${connector.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ ...formPayload, fromName: 'Acme Renamed' })
    updateResponse.assertStatus(302)

    await connector.refresh()
    assert.equal(connector.fromName, 'Acme Renamed')

    const deleteResponse = await client
      .delete(
        `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${connector.id}`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    const found = await SmtpConnector.find(connector.id)
    assert.isNull(found)
  })

  test('deleting the default connector while others exist is refused', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const first = await smtpConnectorService.create(project, owner, formPayload)
    await smtpConnectorService.create(project, owner, { ...formPayload, name: 'Secondary' })

    const response = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}/settings/smtp/${first.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    // BusinessRuleViolation flashes and redirects back rather than a raw error status.
    response.assertStatus(302)

    const stillThere = await SmtpConnector.find(first.id)
    assert.isNotNull(stillThere)
  })

  test('setDefault swaps the default connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const first = await smtpConnectorService.create(project, owner, formPayload)
    const second = await smtpConnectorService.create(project, owner, {
      ...formPayload,
      name: 'Secondary',
    })

    const response = await client
      .post(
        `/organizations/${organization.id}/projects/${project.id}/settings/smtp/${second.id}/default`
      )
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)

    await first.refresh()
    await second.refresh()
    assert.isFalse(first.isDefault)
    assert.isTrue(second.isDefault)
  })

  test('connectors of one project are invisible from another project', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await smtpConnectorService.create(project, owner, formPayload)

    const found = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('name', 'Primary')
      .first()
    assert.isNull(found)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/smtp`)
      .loginAs(owner)
    response.assertStatus(200)
  })

  test('a non-member gets a 404 on a project they do not belong to', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/settings/smtp`)
      .loginAs(outsider)

    response.assertStatus(404)
  })
})
