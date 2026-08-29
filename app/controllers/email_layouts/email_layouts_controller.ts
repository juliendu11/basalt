import type { HttpContext } from '@adonisjs/core/http'
import EmailLayout from '#models/email_layout'
import EmailLayoutPolicy from '#policies/email_layout_policy'
import EmailLayoutService from '#services/emails/email_layout_service'
import { createEmailLayoutValidator, updateEmailLayoutValidator } from '#validators/email_layout'
import EmailLayoutTransformer from '#transformers/email_layout_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import {
  renderVariables,
  renderTextVariables,
  exampleVariableContext,
} from '#services/emails/variable_renderer'
import {
  composeEmailHtml,
  composeEmailText,
  EXAMPLE_BODY_CONTENT,
  EXAMPLE_BODY_TEXT_CONTENT,
} from '#services/emails/email_layout_composer'

const emailLayoutService = new EmailLayoutService()

export default class EmailLayoutsController {
  async index({ project, inertia }: HttpContext) {
    const layouts = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('email_layouts/index', {
      project: ProjectTransformer.transform(project),
      layouts: EmailLayoutTransformer.transform(layouts),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(EmailLayoutPolicy).authorize('create', project)

    return inertia.render('email_layouts/create', {
      project: ProjectTransformer.transform(project),
    })
  }

  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailLayoutPolicy).authorize('create', project)

    const payload = await request.validateUsing(createEmailLayoutValidator)
    await emailLayoutService.create(project, auth.user!, payload)

    session.flash('success', 'Layout created.')
    return response.redirect().toRoute('email_layouts.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.layoutId)
      .first()

    if (!layout) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    await bouncer.with(EmailLayoutPolicy).authorize('update', project)

    return inertia.render('email_layouts/edit', {
      project: ProjectTransformer.transform(project),
      layout: EmailLayoutTransformer.transform(layout),
    })
  }

  async update({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailLayoutPolicy).authorize('update', project)

    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.layoutId)
      .firstOrFail()

    const payload = await request.validateUsing(updateEmailLayoutValidator)
    await emailLayoutService.update(layout, auth.user!, payload)

    session.flash('success', 'Layout updated.')
    return response.redirect().back()
  }

  async destroy({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailLayoutPolicy).authorize('destroy', project)

    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.layoutId)
      .firstOrFail()

    await emailLayoutService.delete(layout, auth.user!)

    session.flash('success', 'Layout deleted.')
    return response.redirect().toRoute('email_layouts.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async duplicate({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(EmailLayoutPolicy).authorize('create', project)

    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.layoutId)
      .firstOrFail()

    await emailLayoutService.duplicate(layout, auth.user!)

    session.flash('success', 'Layout duplicated.')
    return response.redirect().toRoute('email_layouts.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  /**
   * Returns rendered HTML/text directly (not an Inertia page) — the
   * frontend loads `html` into a sandboxed `<iframe srcdoc>`, same
   * mechanism as `EmailTemplatesController#preview`, and shows `text`
   * (nullable, since a layout's text frame is optional) as plain text.
   * Composes the layout's frame with an example body (no real Email exists
   * in this context) before rendering variables.
   */
  async preview({ project, params, response }: HttpContext) {
    const layout = await EmailLayout.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.layoutId)
      .firstOrFail()

    const context = exampleVariableContext(project.name)

    const composedHtml = composeEmailHtml(
      { htmlContent: null, bodyContent: EXAMPLE_BODY_CONTENT },
      layout
    )
    const html = renderVariables(composedHtml, context)

    const composedText = composeEmailText({ textContent: EXAMPLE_BODY_TEXT_CONTENT }, layout)
    const text = composedText ? renderTextVariables(composedText, context) : null

    return response.json({ html, text })
  }
}
