import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import SmtpConnector from '#models/smtp_connector'
import EmailDelivery from '#models/email_delivery'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import GenericSmtpWebhookAdapter from '#services/tracking/smtp_webhook_adapters/generic_adapter'

const adapter = new GenericSmtpWebhookAdapter()

function secretMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * PUBLIC route (docs/plans/16-email-tracking.md § Routes) — no session, no
 * CSRF. Authenticated by the per-connector secret in the URL
 * (`/webhooks/smtp/:connectorId/:secret`, docs/security-audit-2026-10-06.md
 * § 5): a wrong connector/secret gets a 404 and nothing is processed. Events
 * are also restricted to deliveries of the connector's own project, so a
 * connector's URL can never touch another tenant's data.
 */
export default class SmtpWebhooksController {
  async handle({ params, request, response }: HttpContext) {
    const connector = await SmtpConnector.find(params.connectorId)
    if (!connector || !secretMatches(connector.webhookSecret, String(params.secret))) {
      return response.status(404).send('')
    }

    // Always 200 OK, even for a malformed/unrecognized payload — never
    // give a provider a reason to disable the webhook after repeated
    // non-2xx responses (docs/plans/16-email-tracking.md § Validation).
    try {
      const adapted = adapter.adapt(request.body())
      if (adapted) {
        const delivery = await EmailDelivery.query()
          .where('projectId', connector.projectId)
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
