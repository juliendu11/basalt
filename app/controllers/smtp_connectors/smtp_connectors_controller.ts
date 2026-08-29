import type { HttpContext } from '@adonisjs/core/http'
import SmtpConnector from '#models/smtp_connector'
import SmtpConnectorPolicy from '#policies/smtp_connector_policy'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import {
  createSmtpConnectorValidator,
  updateSmtpConnectorValidator,
} from '#validators/smtp_connector'
import SmtpConnectorTransformer from '#transformers/smtp_connector_transformer'
import ProjectTransformer from '#transformers/project_transformer'

const smtpConnectorService = new SmtpConnectorService()

export default class SmtpConnectorsController {
  async index({ project, inertia }: HttpContext) {
    const connectors = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('settings/smtp/index', {
      project: ProjectTransformer.transform(project),
      connectors: SmtpConnectorTransformer.transform(connectors),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('create', project)

    return inertia.render('settings/smtp/create', {
      project: ProjectTransformer.transform(project),
    })
  }

  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('create', project)

    const payload = await request.validateUsing(createSmtpConnectorValidator, {
      meta: { projectId: project.id },
    })
    await smtpConnectorService.create(project, auth.user!, payload)

    session.flash('success', 'SMTP connector created.')
    return response.redirect().toRoute('smtp_connectors.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('update', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .first()

    if (!connector) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    return inertia.render('settings/smtp/edit', {
      project: ProjectTransformer.transform(project),
      connector: SmtpConnectorTransformer.transform(connector),
    })
  }

  async update({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('update', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .firstOrFail()

    const payload = await request.validateUsing(updateSmtpConnectorValidator, {
      meta: { projectId: project.id, connectorId: connector.id },
    })
    await smtpConnectorService.update(connector, auth.user!, payload)

    session.flash('success', 'SMTP connector updated.')
    return response.redirect().toRoute('smtp_connectors.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async destroy({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('destroy', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .firstOrFail()

    await smtpConnectorService.delete(connector, auth.user!)

    session.flash('success', 'SMTP connector deleted.')
    return response.redirect().toRoute('smtp_connectors.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async setDefault({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('update', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .firstOrFail()

    await smtpConnectorService.setDefault(connector, auth.user!)

    session.flash('success', `${connector.name} is now the default connector.`)
    return response.redirect().back()
  }

  async toggleEnabled({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('update', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .firstOrFail()

    await smtpConnectorService.toggleEnabled(connector, auth.user!)

    session.flash(
      'success',
      connector.enabled ? `${connector.name} enabled.` : `${connector.name} disabled.`
    )
    return response.redirect().back()
  }
}
