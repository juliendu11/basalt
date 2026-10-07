/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'

export const throttle = limiter.define('global', () => {
  return limiter.allowRequests(10).every('1 minute')
})

/**
 * Guards the unauthenticated auth endpoints (`POST /login`, `POST /signup`)
 * against brute-force / credential-stuffing and mass account/email
 * enumeration (docs/security-audit-2026-10-06.md § 1). Keyed per IP (the
 * default) — 10 attempts per 15 minutes is ample for a human and ruinous for
 * a script. Applied only to the POST routes, never the GET page loads.
 */
export const authThrottle = limiter.define('auth', () => {
  return limiter.allowRequests(10).every('15 minutes')
})

/**
 * Guards the public SMTP webhook (`POST /webhooks/smtp/:connectorId/:secret`), which
 * is unauthenticated and dispatches a queue job per request, from being used
 * to flood the job queue (docs/security-audit-2026-10-06.md § 4). Generous
 * per-IP budget so a real provider's bursts aren't dropped. The `GET /track/*`
 * pixels are intentionally left unthrottled: legitimate opens are funnelled
 * through shared mail-proxy IPs (e.g. Gmail's image proxy), so an IP limit
 * there would drop real opens.
 */
export const webhookThrottle = limiter.define('webhook', () => {
  return limiter.allowRequests(120).every('1 minute')
})

/** Applied to `/api/v1/*` only (`start/routes.ts`) — keyed per API key, not per IP, so one key can't starve another project's. */
export const apiThrottle = limiter.define('api', (ctx) => {
  return limiter.allowRequests(300).every('1 minute').usingKey(String(ctx.apiKey.id))
})
