import { Exception } from '@adonisjs/core/exceptions'

/**
 * Raised by a job/node executor when the failure is permanent (SMTP 5xx,
 * invalid credentials, inconsistent graph data, ...). Retrying would not
 * change the outcome, so the queue worker fails the job immediately
 * instead of consuming its retry budget. See
 * docs/plans/15-retry-and-idempotency.md.
 */
export default class NonRetryableError extends Exception {
  static code = 'E_NON_RETRYABLE'
}
