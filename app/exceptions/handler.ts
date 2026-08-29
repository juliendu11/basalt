import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError, StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import logger from '@adonisjs/core/services/logger'

/**
 * `/api/v1/*` is the external contacts API (`middleware.apiKeyAuth()`, Bearer
 * key — never a browser session). Its responses must always be JSON: the base
 * handler content-negotiates the error format on the request's `Accept`
 * header, so a client that doesn't explicitly ask for JSON (curl sends no
 * `Accept` header of its own) would otherwise get an HTML error page — a
 * status page (`errors/server_error` / `errors/not_found`), a
 * `redirect().back()` to `/`, or a bare `<p>` — instead of `{ errors: [...] }`.
 */
const API_PREFIX = '/api/v1/'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (_, { inertia }) => inertia.render('errors/not_found', {}),
    '500..599': (_, { inertia }) => inertia.render('errors/server_error', {}),
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof BusinessRuleViolation) {
      // A domain-rule violation on the API (e.g. duplicate email) is a 422,
      // not a flash + redirect — see `API_PREFIX` above.
      if (this.#isApiRequest(ctx)) {
        return ctx.response.status(422).send({ errors: [{ message: error.message }] })
      }

      ctx.session.flash('error', error.message)
      return ctx.response.redirect().back()
    }

    return super.handle(error, ctx)
  }

  /**
   * Content negotiation in `renderError`/`renderValidationError` routes any
   * non-JSON `Accept` (including `*` / none) here. For `/api/v1/*` we answer
   * JSON instead, which also bypasses the Inertia status pages.
   */
  async renderErrorAsHTML(error: HttpError, ctx: HttpContext) {
    if (this.#isApiRequest(ctx)) {
      if (this.isDebuggingEnabled(ctx)) return this.renderErrorAsJSON(error, ctx)
      return ctx.response.status(error.status).send({ errors: [{ message: error.message }] })
    }

    return super.renderErrorAsHTML(error, ctx)
  }

  async renderValidationErrorAsHTML(error: HttpError, ctx: HttpContext) {
    if (this.#isApiRequest(ctx)) {
      return this.renderValidationErrorAsJSON(error, ctx)
    }

    return super.renderValidationErrorAsHTML(error, ctx)
  }

  #isApiRequest(ctx: HttpContext): boolean {
    return ctx.request.url().startsWith(API_PREFIX)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    logger.error(error)

    if (error instanceof BusinessRuleViolation) {
      // Expected, user-facing domain rule — not a bug to report.
      return
    }

    return super.report(error, ctx)
  }
}
