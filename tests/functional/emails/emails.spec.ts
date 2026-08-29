import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import EmailTemplateService from '#services/emails/email_template_service'
import EmailLayoutService from '#services/emails/email_layout_service'
import EmailService from '#services/emails/email_service'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import Email from '#models/email'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const emailTemplateService = new EmailTemplateService()
const emailLayoutService = new EmailLayoutService()
const emailService = new EmailService()
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

const blankPayload = {
  name: 'Newsletter',
  subject: 'Hello {{ contact.firstname }}',
  senderName: 'Acme',
  senderEmail: 'noreply@example.com',
  htmlContent: '<p>Hi {{ contact.firstname }}</p>',
  textContent: 'Hi {{ contact.firstname }}',
}

test.group('Emails (functional)', () => {
  test('a member can create a blank email', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json(blankPayload)

    response.assertStatus(302)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Newsletter')
      .firstOrFail()
    assert.equal(email.status, 'draft')
  })

  test('a member can create an email from a template', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, {
      name: 'Base template',
      subject: 'Templated subject',
      htmlContent: '<p>Templated content</p>',
    })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        templateId: template.id,
        name: 'From template',
        senderName: 'Acme',
        senderEmail: 'noreply@example.com',
      })

    response.assertStatus(302)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'From template')
      .firstOrFail()
    assert.equal(email.emailTemplateId, template.id)
    assert.equal(email.subject, 'Templated subject')
    assert.equal(email.htmlContent, '<p>Templated content</p>')
  })

  test('a member can create an email from a layout', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme</header>{{ email_body }}',
    })

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        layoutId: layout.id,
        name: 'From layout',
        subject: 'Layout subject',
        senderName: 'Acme',
        senderEmail: 'noreply@example.com',
        bodyContent: '<p>Layout content</p>',
      })

    response.assertStatus(302)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'From layout')
      .firstOrFail()
    assert.equal(email.emailLayoutId, layout.id)
    assert.equal(email.subject, 'Layout subject')
    assert.isNull(email.htmlContent)
    assert.equal(email.bodyContent, '<p>Layout content</p>')
  })

  test('a viewer cannot create an email', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json(blankPayload)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', 'Newsletter')
      .first()
    assert.isNull(email)
  })

  test('a member can update, publish and delete an email', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)

    const updateResponse = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ ...blankPayload, name: 'Newsletter (renamed)' })
    updateResponse.assertStatus(302)
    await email.refresh()
    assert.equal(email.name, 'Newsletter (renamed)')

    const publishResponse = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}/publish`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    publishResponse.assertStatus(302)
    await email.refresh()
    assert.equal(email.status, 'published')

    // Publishing never locks the email — it must still be freely editable.
    const editAfterPublish = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ ...blankPayload, name: 'Edited after publish' })
    editAfterPublish.assertStatus(302)
    await email.refresh()
    assert.equal(email.name, 'Edited after publish')
    assert.equal(email.status, 'published')

    const deleteResponse = await client
      .delete(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    deleteResponse.assertStatus(302)

    const found = await Email.find(email.id)
    assert.isNull(found)
  })

  test('a member can switch a published email to a layout, keeping it published', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)
    await emailService.publish(email, owner)
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme</header>{{ email_body }}',
    })

    const response = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        ...blankPayload,
        layoutId: layout.id,
        bodyContent: '<p>Hi {{ contact.firstname }}</p>',
      })

    response.assertStatus(302)
    await email.refresh()
    assert.equal(email.status, 'published')
    assert.equal(email.emailLayoutId, layout.id)
    assert.isNull(email.htmlContent)
    assert.equal(email.bodyContent, '<p>Hi {{ contact.firstname }}</p>')
  })

  test('a member can switch a layout-linked email to a different layout', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const layoutA = await emailLayoutService.create(project, owner, {
      name: 'Layout A',
      htmlContent: '<header>A</header>{{ email_body }}',
    })
    const layoutB = await emailLayoutService.create(project, owner, {
      name: 'Layout B',
      htmlContent: '<header>B</header>{{ email_body }}',
    })
    const email = await emailService.createFromLayout(project, layoutA, owner, {
      name: 'Newsletter',
      subject: 'Hello',
      senderName: 'Acme',
      senderEmail: 'noreply@example.com',
      bodyContent: '<p>Content</p>',
    })

    const response = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Newsletter',
        subject: 'Hello',
        senderName: 'Acme',
        senderEmail: 'noreply@example.com',
        layoutId: layoutB.id,
        bodyContent: '<p>Content</p>',
      })

    response.assertStatus(302)
    await email.refresh()
    assert.equal(email.emailLayoutId, layoutB.id)
    assert.isNull(email.htmlContent)
    assert.equal(email.bodyContent, '<p>Content</p>')
  })

  test('a member can detach a layout-linked email back to custom HTML', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme</header>{{ email_body }}',
    })
    const email = await emailService.createFromLayout(project, layout, owner, {
      name: 'Newsletter',
      subject: 'Hello',
      senderName: 'Acme',
      senderEmail: 'noreply@example.com',
      bodyContent: '<p>Content</p>',
    })

    const response = await client
      .patch(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({
        name: 'Newsletter',
        subject: 'Hello',
        senderName: 'Acme',
        senderEmail: 'noreply@example.com',
        // Materialized frame + fragment, as the frontend seeds it —
        // detaching never has to lose the branding.
        htmlContent: '<header>Acme</header><p>Content</p>',
      })

    response.assertStatus(302)
    await email.refresh()
    assert.isNull(email.emailLayoutId)
    assert.isNull(email.bodyContent)
    assert.equal(email.htmlContent, '<header>Acme</header><p>Content</p>')
  })

  test('preview renders variables', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}/preview`)
      .loginAs(owner)
      .withCsrfToken()

    response.assertStatus(200)
    assert.include(response.body().html, 'Hi Jean')
    assert.equal(response.body().text, 'Hi Jean')
  })

  test('sends a real test email via the project default connector', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)
    await smtpConnectorService.create(project, owner, {
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
      .post(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}/send-test`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ testEmail: 'tester@example.com' })

    response.assertStatus(302)

    const list = (await fetch('http://localhost:1080/messages').then((r) => r.json())) as Array<{
      id: number
      subject: string | null
      recipients: string[]
    }>
    const latest = list.at(-1)!

    assert.include(latest.subject ?? '', '[Test]')
    assert.include(latest.subject ?? '', 'Hello Jean')
    assert.include(latest.recipients.join(), 'tester@example.com')

    const html = await fetch(`http://localhost:1080/messages/${latest.id}.html`).then((r) =>
      r.text()
    )
    assert.include(html, 'Hi Jean')
  }).timeout(20_000)

  test('redirects back gracefully (no crash) when no SMTP connector is configured', async ({
    client,
  }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)

    const response = await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}/send-test`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
      .json({ testEmail: 'tester@example.com' })

    response.assertStatus(302)
  })

  test('a viewer cannot send a test email', async ({ assert, client }) => {
    const { owner, organization, project } = await createProject()
    const email = await emailService.create(project, owner, blankPayload)
    await smtpConnectorService.create(project, owner, {
      name: 'Primary',
      host: 'localhost',
      port: 1025,
      username: 'user@example.com',
      password: 'whatever',
      encryption: 'none',
      fromEmail: 'noreply@example.com',
      fromName: 'Acme',
    })
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    const before = (await fetch('http://localhost:1080/messages').then((r) =>
      r.json()
    )) as unknown[]

    await client
      .post(`/organizations/${organization.id}/projects/${project.id}/emails/${email.id}/send-test`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({ testEmail: 'tester@example.com' })

    const after = (await fetch('http://localhost:1080/messages').then((r) => r.json())) as unknown[]
    assert.lengthOf(after, before.length)
  })

  test('emails of one project are invisible from another project', async ({ client, assert }) => {
    const { owner, organization, project } = await createProject()
    const otherProject = await projectService.create(organization, owner, {
      name: 'Other',
      timezone: 'Europe/Paris',
    })
    await emailService.create(project, owner, blankPayload)

    const found = await Email.query()
      .withScopes((scopes) => scopes.forProject(otherProject))
      .where('name', 'Newsletter')
      .first()
    assert.isNull(found)

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(owner)
    response.assertStatus(200)
  })

  test('a non-member gets a 404', async ({ client }) => {
    const { organization, project } = await createProject()
    const outsider = await UserFactory.create()

    const response = await client
      .get(`/organizations/${organization.id}/projects/${project.id}/emails`)
      .loginAs(outsider)

    response.assertStatus(404)
  })
})
