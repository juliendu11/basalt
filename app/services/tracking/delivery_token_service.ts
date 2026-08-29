import { createHmac, timingSafeEqual } from 'node:crypto'
import env from '#start/env'

const SIGNATURE_LENGTH = 32

/**
 * Public, opaque `deliveryToken` for the `/track/*` routes
 * (docs/plans/16-email-tracking.md § Domain concepts) — never the raw
 * `email_deliveries.id` (docs/plans/02-database-design.md § IDs: nothing
 * auto-increment is ever exposed in a public URL).
 *
 * The plan specifies `deliveryToken = HMAC-SHA256(APP_KEY, id).slice(0, 32)`,
 * computed on the fly and "verifiable both ways without an extra column" —
 * a bare HMAC alone can't literally be reversed back to an id, so the token
 * actually emitted here is `base64url(id) + '.' + signature`: the id travels
 * in the token (never a secret, it's already meaningless without knowing
 * which delivery it maps to unless you also have the signature), and the
 * signature is what makes the id unforgeable/untamperable. This is the
 * standard "signed token" shape (conceptually the same idea as a JWT's
 * signature check) and is what actually lets `decode()` recover an id from
 * a token with no database round-trip, per the plan's own requirement.
 */
export default class DeliveryTokenService {
  encode(deliveryId: number): string {
    const idPart = Buffer.from(String(deliveryId)).toString('base64url')
    return `${idPart}.${this.#sign(deliveryId)}`
  }

  /** Returns the delivery id if `token` is well-formed and its signature checks out, else `null`. */
  decode(token: string): number | null {
    const parts = token.split('.')
    if (parts.length !== 2) return null

    const [idPart, signature] = parts
    if (signature.length !== SIGNATURE_LENGTH) return null

    let deliveryId: number
    try {
      const decoded = Buffer.from(idPart, 'base64url').toString('utf8')
      deliveryId = Number(decoded)
    } catch {
      return null
    }

    if (!Number.isInteger(deliveryId) || deliveryId <= 0) return null

    const expected = this.#sign(deliveryId)
    const expectedBuffer = Buffer.from(expected)
    const signatureBuffer = Buffer.from(signature)

    // Constant-time comparison (docs/plans/16-email-tracking.md § Security
    // considerations) — a length mismatch is checked first since
    // `timingSafeEqual` throws rather than returning false for unequal
    // lengths, but that check happens before any secret-dependent work, so
    // it leaks nothing about the signature itself.
    if (expectedBuffer.length !== signatureBuffer.length) return null
    if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return null

    return deliveryId
  }

  #sign(deliveryId: number): string {
    return createHmac('sha256', env.get('APP_KEY').release())
      .update(String(deliveryId))
      .digest('base64url')
      .slice(0, SIGNATURE_LENGTH)
  }
}
