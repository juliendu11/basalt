import nodemailer from 'nodemailer'
import { assertPublicHost, PrivateAddressError } from '#utils/network'

export interface SmtpConnectionConfig {
  host: string
  port: number
  username: string
  password: string
  encryption: 'none' | 'ssl' | 'tls'
}

export interface SmtpConnectionTestResult {
  success: boolean
  message?: string
}

const VERIFY_TIMEOUT_MS = 8_000

/**
 * Isolated from `SmtpConnectorService` so it stays mockable in tests
 * (docs/plans/07-smtp-connectors.md § Backend architecture). Never logs or
 * includes the raw password in its result — Nodemailer's own connection
 * errors don't echo credentials, so no extra scrubbing is needed on top of
 * not passing the password through ourselves.
 */
export default class SmtpConnectionTester {
  async test(config: SmtpConnectionConfig): Promise<SmtpConnectionTestResult> {
    // SSRF guard (docs/security-audit-2026-10-06.md § 2): the host comes
    // straight from a user form, so refuse — before opening any socket — any
    // host that resolves to a private/loopback/link-local address. We then
    // connect to the exact IP that was vetted rather than letting Nodemailer
    // re-resolve the name, closing the DNS-rebinding gap.
    let vettedAddress: string
    try {
      const [address] = await assertPublicHost(config.host)
      vettedAddress = address
    } catch (error) {
      if (error instanceof PrivateAddressError) {
        return {
          success: false,
          message: 'Connecting to internal or private addresses is not allowed.',
        }
      }
      return { success: false, message: 'Could not resolve the SMTP host.' }
    }

    const transport = nodemailer.createTransport({
      host: vettedAddress,
      port: config.port,
      // TLS cert validation still uses the user-supplied hostname (SNI/servername),
      // not the raw IP we dial, so certificate checks keep working.
      tls: { servername: config.host.trim() },
      secure: config.encryption === 'ssl',
      requireTLS: config.encryption === 'tls',
      auth: { user: config.username, pass: config.password },
      connectionTimeout: VERIFY_TIMEOUT_MS,
      greetingTimeout: VERIFY_TIMEOUT_MS,
      socketTimeout: VERIFY_TIMEOUT_MS,
    })

    try {
      await transport.verify()
      return { success: true }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    } finally {
      transport.close()
    }
  }
}
