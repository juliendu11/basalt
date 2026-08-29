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

/** Applied to `/api/v1/*` only (`start/routes.ts`) — keyed per API key, not per IP, so one key can't starve another project's. */
export const apiThrottle = limiter.define('api', (ctx) => {
  return limiter.allowRequests(300).every('1 minute').usingKey(String(ctx.apiKey.id))
})
