import type { HttpContext } from '@adonisjs/core/http'
import EmailDelivery from '#models/email_delivery'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import GenericSmtpWebhookAdapter from '#services/tracking/smtp_webhook_adapters/generic_adapter'

const adapter = new GenericSmtpWebhookAdapter()

/**
 * PUBLIC route (docs/plans/16-email-tracking.md § Routes) — no session, no
 * CSRF. `:connectorId` identifies which SMTP connector's webhook this is,
 * for a future per-connector signature secret (see the class doc comment
 * below for the current gap).
 *
 * NOTE (reported per the implementation directive): `SmtpConnector`
 * (docs/plans/07-smtp-connectors.md, Phase 5) has no stored webhook-signature
 * secret column — that phase didn't anticipate incoming webhooks. Signature
 * verification is therefore NOT implemented in this phase; this is the
 * accepted-risk path the plan itself scopes as best-effort/provider-dependent
 * (§ Open questions: provider-specific adapters, of which signature
 * verification would be one, are explicitly deferred beyond
 * `generic_adapter.ts`). A real gap, flagged rather than silently skipped.
 */
export default class SmtpWebhooksController {
  /**
   * POST /webhooks/smtp/:connectorId — `connectorId` is accepted (routes to
   * this handler) but not otherwise used yet, since no per-connector
   * signature secret exists to look up (see class doc comment).
   */
  async handle({ request, response }: HttpContext) {
    // Always 200 OK, even for a malformed/unrecognized payload — never
    // give a provider a reason to disable the webhook after repeated
    // non-2xx responses (docs/plans/16-email-tracking.md § Validation).
    try {
      const adapted = adapter.adapt(request.body())
      if (adapted) {
        const delivery = await EmailDelivery.query()
          .where('providerMessageId', adapted.providerMessageId)
          .first()

        if (delivery) {
          await queueDispatcher.dispatch('tracking', 'tracking.process_event', {
            deliveryId: delivery.id,
            type: adapted.type,
            metadata: adapted.metadata,
          })
        }
      }
    } catch {
      // Never let a malformed payload surface as a 4xx/5xx to the provider.
    }

    return response.status(200).send('')
  }
}
