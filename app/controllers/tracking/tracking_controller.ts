import type { HttpContext } from '@adonisjs/core/http'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import DeliveryTokenService from '#services/tracking/delivery_token_service'

// 1x1 transparent GIF, served byte-identically for every request regardless
// of whether the token resolves — docs/plans/16-email-tracking.md § Security
// considerations: never let a response difference reveal whether a token is
// valid.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64'
)

const deliveryTokenService = new DeliveryTokenService()

/**
 * PUBLIC routes (docs/plans/16-email-tracking.md § Routes) — no session, no
 * CSRF, no project/organization context. Security relies entirely on the
 * unforgeable `deliveryToken`, not on any auth middleware.
 */
export default class TrackingController {
  /** GET /track/open/:deliveryToken.gif */
  async open({ params, request, response }: HttpContext) {
    const deliveryId = deliveryTokenService.decode(params.deliveryToken)

    if (deliveryId !== null) {
      await queueDispatcher.dispatch('tracking', 'tracking.process_event', {
        deliveryId,
        type: 'opened',
        metadata: {
          userAgent: request.header('user-agent') ?? null,
          ip: request.ip(),
        },
      })
    }

    response.header('Content-Type', 'image/gif')
    response.header('Cache-Control', 'no-store')
    return response.send(TRANSPARENT_GIF)
  }

  /** GET /track/click/:deliveryToken */
  async click({ params, request, response }: HttpContext) {
    const deliveryId = deliveryTokenService.decode(params.deliveryToken)
    const rawUrl = request.input('u')
    const targetUrl = this.#validRedirectTarget(rawUrl)

    if (deliveryId !== null) {
      await queueDispatcher.dispatch('tracking', 'tracking.process_event', {
        deliveryId,
        type: 'clicked',
        metadata: {
          url: targetUrl,
          userAgent: request.header('user-agent') ?? null,
        },
      })
    }

    // Never break the recipient's navigation for a tracking problem
    // (invalid/expired token) as long as a valid target URL is present —
    // docs/plans/16-email-tracking.md § Edge cases. `withQs(false)`:
    // this app defaults `redirect.forwardQueryString` to `true`
    // (config/app.ts), which would otherwise carry our own `?u=...`
    // tracking param over onto the recipient's landing page URL.
    if (targetUrl) return response.redirect().withQs(false).toPath(targetUrl)

    return response.status(404).send('')
  }

  /**
   * `u` must be an absolute http(s) URL — rejects `javascript:`/other
   * dangerous schemes before ever redirecting (docs/plans/16-email-tracking.md
   * § Security considerations).
   */
  #validRedirectTarget(rawUrl: unknown): string | null {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null

    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return rawUrl
    } catch {
      return null
    }
  }
}
