import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import EmailTemplateService from '#services/emails/email_template_service'
import EmailTemplate from '#models/email_template'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const emailTemplateService = new EmailTemplateService()

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
  name: 'Welcome',
  subject: 'Welcome to {{ project.name }}',
  htmlContent: '<p>Hello {{ contact.firstname }}</p>',
  textContent: 'Hello {{ contact.firstname }}',
}

test.group('EmailTemplateService.duplicate', () => {
  test('creates an independent copy with a suffixed name', async ({ assert }) => {
    const { owner, project } = await createProject()
    const original = await emailTemplateService.create(project, owner, basePayload)

    const copy = await emailTemplateService.duplicate(original, owner)

    assert.notEqual(copy.id, original.id)
    assert.equal(copy.name, 'Welcome (copie)')
    assert.equal(copy.htmlContent, original.htmlContent)
  })

  test('editing the original afterward does not affect the duplicate', async ({ assert }) => {
    const { owner, project } = await createProject()
    const original = await emailTemplateService.create(project, owner, basePayload)
    const copy = await emailTemplateService.duplicate(original, owner)

    await emailTemplateService.update(original, owner, {
      ...basePayload,
      htmlContent: '<p>Completely different content</p>',
    })

    await copy.refresh()
    assert.equal(copy.htmlContent, basePayload.htmlContent)
  })
})

test.group('EmailTemplateService.delete', () => {
  test('is allowed even though no emails reference it (no-op FK check)', async ({ assert }) => {
    const { owner, project } = await createProject()
    const template = await emailTemplateService.create(project, owner, basePayload)

    await emailTemplateService.delete(template, owner)

    const found = await EmailTemplate.find(template.id)
    assert.isNull(found)
  })
})
