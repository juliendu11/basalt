import nodemailer from 'nodemailer'

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
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
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
