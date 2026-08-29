import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import EmailTemplateService from '#services/emails/email_template_service'
import EmailLayoutService from '#services/emails/email_layout_service'
import EmailService from '#services/emails/email_service'
import { composeEmailHtml } from '#services/emails/email_layout_composer'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const emailTemplateService = new EmailTemplateService()
const emailLayoutService = new EmailLayoutService()
const emailService = new EmailService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

const templatePayload = {
  name: 'Welcome',
  subject: 'Welcome to {{ project.name }}',
  htmlContent: '<p>Hello {{ contact.firstname }}</p>',
  textContent: 'Hello {{ contact.firstname }}',
}

const overrides = {
  name: 'Welcome email',
  senderName: 'Acme',
  senderEmail: 'noreply@example.com',
}

test.group('EmailService.createFromTemplate', () => {
  test('copies subject/htmlContent/textContent from the template', async ({ assert }) => {
    const { owner, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, templatePayload)

    const email = await emailService.createFromTemplate(project, template, owner, overrides)

    assert.equal(email.emailTemplateId, template.id)
    assert.equal(email.subject, template.subject)
    assert.equal(email.htmlContent, template.htmlContent)
    assert.equal(email.name, overrides.name)
    assert.equal(email.status, 'draft')
  })

  test('editing the source template afterward does not affect the email', async ({ assert }) => {
    const { owner, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, templatePayload)
    const email = await emailService.createFromTemplate(project, template, owner, overrides)

    await emailTemplateService.update(template, owner, {
      ...templatePayload,
      htmlContent: '<p>Changed after the fact</p>',
    })

    await email.refresh()
    assert.equal(email.htmlContent, templatePayload.htmlContent)
  })
})

const layoutPayload = {
  name: 'Branding frame',
  htmlContent: '<header>Acme</header>{{ email_body }}<footer>{{ unsubscribe_url }}</footer>',
}

const layoutOverrides = {
  name: 'Welcome email',
  subject: 'Welcome!',
  senderName: 'Acme',
  senderEmail: 'noreply@example.com',
  bodyContent: '<p>Hello {{ contact.firstname }}</p>',
}

test.group('EmailService.createFromLayout', () => {
  test('links bodyContent to the layout, leaves htmlContent null', async ({ assert }) => {
    const { owner, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, layoutPayload)

    const email = await emailService.createFromLayout(project, layout, owner, layoutOverrides)

    assert.equal(email.emailLayoutId, layout.id)
    assert.equal(email.subject, layoutOverrides.subject)
    assert.isNull(email.htmlContent)
    assert.equal(email.bodyContent, layoutOverrides.bodyContent)
    assert.equal(email.name, layoutOverrides.name)
    assert.equal(email.status, 'draft')
  })

  test('editing the layout afterward changes the composed HTML (live frame)', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, layoutPayload)
    const email = await emailService.createFromLayout(project, layout, owner, layoutOverrides)

    const updated = await emailLayoutService.update(layout, owner, {
      ...layoutPayload,
      htmlContent: '<header>Changed</header>{{ email_body }}',
    })

    assert.equal(
      composeEmailHtml(email, updated),
      `<header>Changed</header>${layoutOverrides.bodyContent}`
    )
  })
})

test.group('EmailService.publish/unpublish', () => {
  test('publishing does not prevent further edits (status is informational only)', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const email = await emailService.create(project, owner, {
      name: 'Newsletter',
      subject: 'Hello',
      senderName: 'Acme',
      senderEmail: 'noreply@example.com',
      htmlContent: '<p>Hi</p>',
    })

    await emailService.publish(email, owner)
    assert.equal(email.status, 'published')

    const updated = await emailService.update(email, owner, {
      name: 'Newsletter',
      subject: 'Hello (edited)',
      senderName: 'Acme',
      senderEmail: 'noreply@example.com',
      htmlContent: '<p>Hi, edited</p>',
    })

    assert.equal(updated.subject, 'Hello (edited)')
    assert.equal(updated.status, 'published')
  })
})
