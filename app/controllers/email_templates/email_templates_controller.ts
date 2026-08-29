import type { HttpContext } from '@adonisjs/core/http'
import EmailTemplate from '#models/email_template'
import EmailTemplatePolicy from '#policies/email_template_policy'
import EmailTemplateService from '#services/emails/email_template_service'
import {
  createEmailTemplateValidator,
  updateEmailTemplateValidator,
} from '#validators/email_template'
import EmailTemplateTransformer from '#transformers/email_template_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import {
  renderVariables,
  renderTextVariables,
  exampleVariableContext,
} from '#services/emails/variable_renderer'

const emailTemplateService = new EmailTemplateService()

export default class EmailTemplatesController {
  async index({ project, inertia }: HttpContext) {
    const templates = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('email_templates/index', {
      project: ProjectTransformer.transform(project),
      templates: EmailTemplateTransformer.transform(templates),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(EmailTemplatePolicy).authorize('create', project)

    return inertia.render('email_templates/create', {
      project: ProjectTransformer.transform(project),
    })
  }

  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailTemplatePolicy).authorize('create', project)

    const payload = await request.validateUsing(createEmailTemplateValidator)
    await emailTemplateService.create(project, auth.user!, payload)

    session.flash('success', 'Template created.')
    return response.redirect().toRoute('email_templates.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.templateId)
      .first()

    if (!template) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    await bouncer.with(EmailTemplatePolicy).authorize('update', project)

    return inertia.render('email_templates/edit', {
      project: ProjectTransformer.transform(project),
      template: EmailTemplateTransformer.transform(template),
    })
  }

  async update({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailTemplatePolicy).authorize('update', project)

    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.templateId)
      .firstOrFail()

    const payload = await request.validateUsing(updateEmailTemplateValidator)
    await emailTemplateService.update(template, auth.user!, payload)

    session.flash('success', 'Template updated.')
    return response.redirect().back()
  }

  async destroy({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailTemplatePolicy).authorize('destroy', project)

    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.templateId)
      .firstOrFail()

    await emailTemplateService.delete(template, auth.user!)

    session.flash('success', 'Template deleted.')
    return response.redirect().toRoute('email_templates.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async duplicate({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailTemplatePolicy).authorize('create', project)

    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.templateId)
      .firstOrFail()

    await emailTemplateService.duplicate(template, auth.user!)

    session.flash('success', 'Template duplicated.')
    return response.redirect().toRoute('email_templates.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  /**
   * Returns rendered HTML/text directly (not an Inertia page) — the
   * frontend loads `html` into a sandboxed `<iframe srcdoc>`
   * (docs/plans/08-email-templates.md § Security considerations) and shows
   * `text` (nullable, since text content is optional) as plain text.
   */
  async preview({ project, params, response }: HttpContext) {
    const template = await EmailTemplate.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.templateId)
      .firstOrFail()

    const context = exampleVariableContext(project.name, template.subject)
    const html = renderVariables(template.htmlContent, context)
    const text = template.textContent ? renderTextVariables(template.textContent, context) : null

    return response.json({ html, text })
  }
}
