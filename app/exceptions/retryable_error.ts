import { Exception } from '@adonisjs/core/exceptions'

/**
 * Raised by a job/node executor when the failure is transient (network
 * timeout, temporary SMTP 4xx, deadlock, ...). The queue worker retries
 * the job according to the backoff strategy configured for its queue.
 * See docs/plans/15-retry-and-idempotency.md.
 */
export default class RetryableError extends Exception {
  static code = 'E_RETRYABLE'
}
