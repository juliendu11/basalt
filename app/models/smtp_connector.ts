import { SmtpConnectorSchema } from '#database/schema'
import { randomBytes } from 'node:crypto'
import { beforeCreate, belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'

export default class SmtpConnector extends SmtpConnectorSchema {
  /**
   * Unguessable per-connector secret embedded in the provider webhook URL
   * (`/webhooks/smtp/:connectorId/:secret`) — authenticates inbound events
   * (docs/security-audit-2026-10-06.md § 5). Generated here so every creation
   * path (service, tests, seeders) gets one.
   */
  @beforeCreate()
  static ensureWebhookSecret(connector: SmtpConnector) {
    connector.webhookSecret ??= randomBytes(32).toString('base64url')
  }

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  /** Usage: SmtpConnector.query().withScopes((s) => s.forProject(project)) */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id)
  })

  static enabled = scope((query) => {
    query.where('enabled', true)
  })

  static default = scope((query) => {
    query.where('isDefault', true)
  })
}
