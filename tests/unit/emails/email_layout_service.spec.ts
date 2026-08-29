import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import EmailLayoutService from '#services/emails/email_layout_service'
import EmailService from '#services/emails/email_service'
import EmailLayout from '#models/email_layout'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
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

const basePayload = {
  name: 'Branding frame',
  htmlContent: '<header>Acme</header>{{ email_body }}',
  textContent: 'Acme\n{{ email_body }}',
}

test.group('EmailLayoutService.duplicate', () => {
  test('creates an independent copy with a suffixed name', async ({ assert }) => {
    const { owner, project } = await createProject()
    const original = await emailLayoutService.create(project, owner, basePayload)

    const copy = await emailLayoutService.duplicate(original, owner)

    assert.notEqual(copy.id, original.id)
    assert.equal(copy.name, 'Branding frame (copie)')
    assert.equal(copy.htmlContent, original.htmlContent)
    assert.equal(copy.textContent, original.textContent)
  })

  test('editing the original afterward does not affect the duplicate', async ({ assert }) => {
    const { owner, project } = await createProject()
    const original = await emailLayoutService.create(project, owner, basePayload)
    const copy = await emailLayoutService.duplicate(original, owner)

    await emailLayoutService.update(original, owner, {
      ...basePayload,
      htmlContent: '<header>Completely different content</header>{{ email_body }}',
    })

    await copy.refresh()
    assert.equal(copy.htmlContent, basePayload.htmlContent)
  })
})

test.group('EmailLayoutService.delete', () => {
  test('is allowed even though no emails reference it (no-op FK check)', async ({ assert }) => {
    const { owner, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, basePayload)

    await emailLayoutService.delete(layout, owner)

    const found = await EmailLayout.find(layout.id)
    assert.isNull(found)
  })

  test('materializes the composed HTML and text into every linked Email before detaching it', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const layout = await emailLayoutService.create(project, owner, basePayload)
    const email = await emailService.createFromLayout(project, layout, owner, {
      name: 'Welcome email',
      subject: 'Welcome!',
      senderName: 'Acme',
      senderEmail: 'noreply@example.com',
      bodyContent: '<p>Hi there</p>',
      textContent: 'Hi there',
    })

    await emailLayoutService.delete(layout, owner)

    await email.refresh()
    assert.isNull(email.emailLayoutId)
    assert.isNull(email.bodyContent)
    assert.equal(email.htmlContent, '<header>Acme</header><p>Hi there</p>')
    assert.equal(email.textContent, 'Acme\nHi there')
  })
})
