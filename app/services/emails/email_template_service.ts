import type User from '#models/user'
import type Project from '#models/project'
import EmailTemplate from '#models/email_template'
import EmailTemplateCreated from '#events/email_template_created'
import EmailTemplateUpdated from '#events/email_template_updated'
import EmailTemplateDeleted from '#events/email_template_deleted'

export interface EmailTemplatePayload {
  name: string
  subject: string
  htmlContent: string
  textContent?: string | null
}

export default class EmailTemplateService {
  async create(
    project: Project,
    actor: User,
    payload: EmailTemplatePayload
  ): Promise<EmailTemplate> {
    const template = await EmailTemplate.create({
      projectId: project.id,
      name: payload.name,
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent ?? null,
    })

    await EmailTemplateCreated.dispatch(template, actor)

    return template
  }

  async update(
    template: EmailTemplate,
    actor: User,
    payload: EmailTemplatePayload
  ): Promise<EmailTemplate> {
    template.merge({
      name: payload.name,
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent ?? null,
    })
    await template.save()

    await EmailTemplateUpdated.dispatch(template, actor)

    return template
  }

  /**
   * Allowed even if `Email`s were created from this template — their
   * content was already copied at creation time and is unaffected;
   * `emails.email_template_id` simply becomes `null` (FK `SET NULL`,
   * docs/plans/08-email-templates.md § Services).
   */
  async delete(template: EmailTemplate, actor: User): Promise<void> {
    await template.delete()

    await EmailTemplateDeleted.dispatch(template, actor)
  }

  /**
   * Copies content into a brand new row — fully independent afterward,
   * editing the original never affects the duplicate
   * (docs/plans/08-email-templates.md § User flows).
   */
  async duplicate(template: EmailTemplate, actor: User): Promise<EmailTemplate> {
    const copy = await EmailTemplate.create({
      projectId: template.projectId,
      name: `${template.name} (copie)`,
      subject: template.subject,
      htmlContent: template.htmlContent,
      textContent: template.textContent,
    })

    await EmailTemplateCreated.dispatch(copy, actor)

    return copy
  }
}
