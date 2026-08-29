import type { HttpContext } from '@adonisjs/core/http'
import Email from '#models/email'
import EmailTemplate from '#models/email_template'
import EmailLayout from '#models/email_layout'
import EmailPolicy from '#policies/email_policy'
import EmailService from '#services/emails/email_service'
import EmailTestSendService from '#services/emails/email_test_send_service'
import { GoogleTranslateUnavailableError } from '#services/emails/google_translate_service'
import {
  createEmailValidator,
  updateEmailValidator,
  createEmailFromTemplateValidator,
  createEmailFromLayoutValidator,
  updateEmailFromLayoutValidator,
  translateEmailValidator,
  sendTestEmailValidator,
} from '#validators/email'
import EmailTransformer from '#transformers/email_transformer'
import EmailTemplateTransformer from '#transformers/email_template_transformer'
import EmailLayoutTransformer from '#transformers/email_layout_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import {
  renderVariables,
  renderTextVariables,
  exampleVariableContext,
} from '#services/emails/variable_renderer'
import { composeEmailHtml, composeEmailText } from '#services/emails/email_layout_composer'

const emailService = new EmailService()
const emailTestSendService = new EmailTestSendService()

export default class EmailsController {
  async index({ project, inertia }: HttpContext) {
    const emails = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('emails/index', {
      project: ProjectTransformer.transform(project),
      emails: EmailTransformer.transform(emails),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('create', project)

    const [templates, layouts] = await Promise.all([
      EmailTemplate.query()
        .withScopes((scopes) => scopes.forProject(project))
        .orderBy('name', 'asc'),
      EmailLayout.query()
        .withScopes((scopes) => scopes.forProject(project))
        .orderBy('name', 'asc'),
    ])

    return inertia.render('emails/create', {
      project: ProjectTransformer.transform(project),
      templates: EmailTemplateTransformer.transform(templates),
      layouts: EmailLayoutTransformer.transform(layouts),
    })
  }

  /**
   * A single endpoint backs "blank", "from a template", and "from a layout"
   * creation (docs/plans/09-emails.md § User flows) — distinguished by
   * whether `templateId`/`layoutId` is present in the payload.
   */
  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('create', project)

    if (request.input('templateId')) {
      const payload = await request.validateUsing(createEmailFromTemplateValidator)
      const template = await EmailTemplate.query()
        .withScopes((scopes) => scopes.forProject(project))
        .where('id', payload.templateId)
        .firstOrFail()

      const email = await emailService.createFromTemplate(project, template, auth.user!, payload)

      session.flash('success', `${email.name} was created from a template.`)
      return response.redirect().toRoute('emails.edit', {
        organizationId: project.organizationId,
        projectId: project.id,
        emailId: email.id,
      })
    }

    if (request.input('layoutId')) {
      const payload = await request.validateUsing(createEmailFromLayoutValidator)
      const layout = await EmailLayout.query()
        .withScopes((scopes) => scopes.forProject(project))
        .where('id', payload.layoutId)
        .firstOrFail()

      const email = await emailService.createFromLayout(project, layout, auth.user!, payload)

      session.flash('success', `${email.name} was created from a layout.`)
      return response.redirect().toRoute('emails.edit', {
        organizationId: project.organizationId,
        projectId: project.id,
        emailId: email.id,
      })
    }

    const payload = await request.validateUsing(createEmailValidator)
    const email = await emailService.create(project, auth.user!, payload)

    session.flash('success', `${email.name} was created.`)
    return response.redirect().toRoute('emails.edit', {
      organizationId: project.organizationId,
      projectId: project.id,
      emailId: email.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .first()

    if (!email) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    await bouncer.with(EmailPolicy).authorize('update', project)

    const layouts = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('emails/edit', {
      project: ProjectTransformer.transform(project),
      email: EmailTransformer.transform(email),
      // The full list (not just the currently-linked one), so the page can
      // offer switching to a different layout — see "change layout" in
      // emails/edit.vue.
      layouts: EmailLayoutTransformer.transform(layouts),
    })
  }

  /**
   * Which validator/service method runs is decided by the SUBMITTED
   * `layoutId` (mirrors `store()`), not `email.emailLayoutId` — that's what
   * lets this endpoint also change (or add/remove) an already-created
   * Email's layout, including a published one (docs/plans/09-emails.md §
   * User flows: publish is never a lock).
   */
  async update({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('update', project)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .firstOrFail()

    if (request.input('layoutId')) {
      const payload = await request.validateUsing(updateEmailFromLayoutValidator)
      const layout = await EmailLayout.query()
        .withScopes((scopes) => scopes.forProject(project))
        .where('id', payload.layoutId)
        .firstOrFail()

      await emailService.updateFromLayout(email, layout, auth.user!, payload)
    } else {
      const payload = await request.validateUsing(updateEmailValidator)
      await emailService.update(email, auth.user!, payload)
    }

    session.flash('success', 'Email updated.')
    return response.redirect().back()
  }

  async destroy({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('destroy', project)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .firstOrFail()

    await emailService.delete(email, auth.user!)

    session.flash('success', 'Email deleted.')
    return response.redirect().toRoute('emails.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async duplicate({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('create', project)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .firstOrFail()

    await emailService.duplicate(email, auth.user!)

    session.flash('success', 'Email duplicated.')
    return response.redirect().toRoute('emails.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async translate({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('create', project)

    const payload = await request.validateUsing(translateEmailValidator)
    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .firstOrFail()

    try {
      const translated = await emailService.translate(email, auth.user!, payload.targetLanguage)

      session.flash('success', `${translated.name} was created from a translation.`)
      return response.redirect().toRoute('emails.edit', {
        organizationId: project.organizationId,
        projectId: project.id,
        emailId: translated.id,
      })
    } catch (error) {
      if (!(error instanceof GoogleTranslateUnavailableError)) throw error
      session.flash('error', error.message)
      return response.redirect().back()
    }
  }

  async publish({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('update', project)

    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .firstOrFail()

    if (email.status === 'published') {
      await emailService.unpublish(email, auth.user!)
      session.flash('success', 'Email unpublished.')
    } else {
      await emailService.publish(email, auth.user!)
      session.flash('success', 'Email published.')
    }

    return response.redirect().back()
  }

  /**
   * Sends a real, one-off test send to an arbitrary address via the
   * project's default connector (docs/plans/09-emails.md § User flows) —
   * see `EmailTestSendService` for what it does and deliberately skips.
   */
  async sendTest({ project, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailPolicy).authorize('update', project)

    const payload = await request.validateUsing(sendTestEmailValidator)
    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .preload('emailLayout')
      .firstOrFail()

    try {
      await emailTestSendService.send(project, email, payload.testEmail)
      session.flash('success', `Test email sent to ${payload.testEmail}.`)
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Failed to send test email.')
    }

    return response.redirect().back()
  }

  /**
   * Returns rendered HTML/text directly (not an Inertia page) — same
   * mechanism as `EmailTemplatesController#preview`
   * (docs/plans/09-emails.md § Security considerations). `text` is
   * nullable, since text content is optional.
   */
  async preview({ project, params, response }: HttpContext) {
    const email = await Email.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.emailId)
      .preload('emailLayout')
      .firstOrFail()

    const context = exampleVariableContext(project.name, email.subject)

    const composedHtml = composeEmailHtml(email, email.emailLayout ?? null)
    const html = renderVariables(composedHtml, context)

    const composedText = composeEmailText(email, email.emailLayout ?? null)
    const text = composedText ? renderTextVariables(composedText, context) : null

    return response.json({ html, text })
  }
}
