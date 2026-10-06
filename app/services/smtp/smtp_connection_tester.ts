import nodemailer from 'nodemailer'
import app from '@adonisjs/core/services/app'
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
    // host that resolves to a private/loopback/link-local address, and then
    // connect to the exact IP that was vetted rather than letting Nodemailer
    // re-resolve the name (closing the DNS-rebinding gap).
    //
    // Enforced in production only. The hosted, multi-tenant deployment must
    // never let a tenant reach the host's internal network / cloud metadata;
    // but in dev/test (and a self-hosted single-tenant box) the SMTP relay is
    // legitimately on localhost / a private LAN (e.g. Mailcatcher on
    // localhost:1025), so the guard would be a false positive there.
    let dialHost = config.host
    let servername: string | undefined
    if (app.inProduction) {
      try {
        const [address] = await assertPublicHost(config.host)
        dialHost = address
        // TLS cert validation still uses the user-supplied hostname (SNI),
        // not the raw IP we dial, so certificate checks keep working.
        servername = config.host.trim()
      } catch (error) {
        if (error instanceof PrivateAddressError) {
          return {
            success: false,
            message: 'Connecting to internal or private addresses is not allowed.',
          }
        }
        return { success: false, message: 'Could not resolve the SMTP host.' }
      }
    }

    const transport = nodemailer.createTransport({
      host: dialHost,
      port: config.port,
      tls: servername ? { servername } : undefined,
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
