import { Exception } from '@adonisjs/core/exceptions'

/**
 * Raised when a service refuses an action because of a domain rule (e.g.
 * "the last owner can't leave the organization") — never for malformed
 * input, which VineJS validators already handle. Handled centrally in
 * app/exceptions/handler.ts: flashes `error` with the message and
 * redirects back, reusing the flash pattern from
 * app/middleware/inertia_middleware.ts rather than each controller
 * having to catch it individually.
 */
export default class BusinessRuleViolation extends Exception {
  static status = 422
  static code = 'E_BUSINESS_RULE_VIOLATION'
}
