import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import type User from '#models/user'
import type Project from '#models/project'
import SmtpConnector from '#models/smtp_connector'
import SmtpConnectorCreated from '#events/smtp_connector_created'
import SmtpConnectorUpdated from '#events/smtp_connector_updated'
import SmtpConnectorDeleted from '#events/smtp_connector_deleted'
import SmtpConnectorDefaultChanged from '#events/smtp_connector_default_changed'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import type { SmtpConnectionTestResult } from '#services/smtp/smtp_connection_tester'

export interface SmtpConnectorPayload {
  name: string
  host: string
  port: number
  username: string
  password?: string
  encryption: 'none' | 'ssl' | 'tls'
  fromEmail: string
  fromName: string
  replyTo?: string | null
  dailyLimit?: number | null
}

export default class SmtpConnectorService {
  /**
   * The first connector created for a project always becomes its default
   * (docs/plans/07-smtp-connectors.md § User flows) — there is no
   * "no default" state once at least one connector exists.
   */
  async create(
    project: Project,
    actor: User,
    payload: SmtpConnectorPayload
  ): Promise<SmtpConnector> {
    const isFirstConnector =
      (await SmtpConnector.query().where('projectId', project.id).first()) === null

    const connector = await SmtpConnector.create({
      projectId: project.id,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      passwordEncrypted: encryption.encrypt(payload.password ?? ''),
      encryption: payload.encryption,
      fromEmail: payload.fromEmail,
      fromName: payload.fromName,
      replyTo: payload.replyTo ?? null,
      dailyLimit: payload.dailyLimit ?? null,
      isDefault: isFirstConnector,
      enabled: true,
      lastTestStatus: 'unknown',
    })

    await SmtpConnectorCreated.dispatch(connector, actor)

    return connector
  }

  /**
   * An empty/absent `payload.password` means "keep the existing password"
   * (docs/plans/07-smtp-connectors.md § Frontend architecture) — the
   * password field is write-only and never round-trips to the frontend, so
   * there's no way to distinguish "cleared intentionally" from "left blank"
   * other than always treating blank as "keep existing" (a password should
   * never be intentionally blanked, only replaced).
   */
  async update(
    connector: SmtpConnector,
    actor: User,
    payload: SmtpConnectorPayload
  ): Promise<SmtpConnector> {
    connector.merge({
      name: payload.name,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      encryption: payload.encryption,
      fromEmail: payload.fromEmail,
      fromName: payload.fromName,
      replyTo: payload.replyTo ?? null,
      dailyLimit: payload.dailyLimit ?? null,
    })

    if (payload.password) {
      connector.passwordEncrypted = encryption.encrypt(payload.password)
    }

    await connector.save()

    await SmtpConnectorUpdated.dispatch(connector, actor)

    return connector
  }

  /**
   * Refuses to delete the project's default connector while other
   * connectors exist (docs/plans/07-smtp-connectors.md § Services) — the
   * caller must pick a new default first. The "referenced by an active
   * published campaign" refusal from the same section can't be implemented
   * yet since campaigns don't exist in this codebase
   * (docs/plans/10-campaign-model.md and later) — deferred, same pattern as
   * ContactService.softDelete deferring the enrollment cascade.
   */
  async delete(connector: SmtpConnector, actor: User): Promise<void> {
    if (connector.isDefault) {
      const otherConnectorsExist =
        (await SmtpConnector.query()
          .where('projectId', connector.projectId)
          .whereNot('id', connector.id)
          .first()) !== null

      if (otherConnectorsExist) {
        throw new BusinessRuleViolation(
          'Choose another default connector before deleting this one.'
        )
      }
    }

    await connector.delete()

    await SmtpConnectorDeleted.dispatch(connector, actor)
  }

  /** Transaction: unsets the project's previous default, sets the new one. */
  async setDefault(connector: SmtpConnector, actor: User): Promise<SmtpConnector> {
    await db.transaction(async (trx) => {
      await SmtpConnector.query({ client: trx })
        .where('projectId', connector.projectId)
        .where('isDefault', true)
        .whereNot('id', connector.id)
        .update({ isDefault: false })

      connector.useTransaction(trx)
      connector.isDefault = true
      await connector.save()
    })

    await SmtpConnectorDefaultChanged.dispatch(connector, actor)

    return connector
  }

  async toggleEnabled(connector: SmtpConnector, actor: User): Promise<SmtpConnector> {
    connector.enabled = !connector.enabled
    await connector.save()

    await SmtpConnectorUpdated.dispatch(connector, actor)

    return connector
  }

  /**
   * Decrypts the password only for the caller's immediate use (a real
   * connection test) — never persisted, transformed, or logged in cleartext
   * (docs/plans/07-smtp-connectors.md § Backend architecture).
   */
  decryptedConfig(connector: SmtpConnector): {
    host: string
    port: number
    username: string
    password: string
    encryption: 'none' | 'ssl' | 'tls'
  } {
    return {
      host: connector.host,
      port: connector.port,
      username: connector.username,
      password: encryption.decrypt<string>(connector.passwordEncrypted) ?? '',
      encryption: connector.encryption,
    }
  }

  async recordTestResult(
    connector: SmtpConnector,
    result: SmtpConnectionTestResult
  ): Promise<SmtpConnector> {
    connector.lastTestedAt = DateTime.now()
    connector.lastTestStatus = result.success ? 'success' : 'failed'
    await connector.save()
    return connector
  }
}
