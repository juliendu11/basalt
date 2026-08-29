import type { HttpContext } from '@adonisjs/core/http'
import SmtpConnector from '#models/smtp_connector'
import SmtpConnectorPolicy from '#policies/smtp_connector_policy'
import SmtpConnectorService from '#services/smtp/smtp_connector_service'
import SmtpConnectionTester from '#services/smtp/smtp_connection_tester'
import { testSmtpConnectionValidator } from '#validators/smtp_connector'

const smtpConnectorService = new SmtpConnectorService()
const smtpConnectionTester = new SmtpConnectionTester()

export default class SmtpConnectorTestsController {
  /**
   * Tests connection parameters from the create/edit form without
   * persisting anything (docs/plans/07-smtp-connectors.md § Routes) — the
   * timeout guarding this request lives in `SmtpConnectionTester` itself
   * (its Nodemailer transport is configured with an 8s
   * connection/greeting/socket timeout), so this action can't hang the HTTP
   * request indefinitely.
   */
  async test({ project, request, bouncer, response }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('create', project)

    const payload = await request.validateUsing(testSmtpConnectionValidator)
    const result = await smtpConnectionTester.test(payload)

    return response.json(result)
  }

  async testExisting({ project, params, bouncer, response }: HttpContext) {
    await bouncer.with(SmtpConnectorPolicy).authorize('update', project)

    const connector = await SmtpConnector.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.connectorId)
      .firstOrFail()

    const result = await smtpConnectionTester.test(smtpConnectorService.decryptedConfig(connector))
    await smtpConnectorService.recordTestResult(connector, result)

    return response.json(result)
  }
}
