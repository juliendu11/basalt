import type AuditLog from '#models/audit_log'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * `actorUserId = null` (a system-triggered action, e.g. `CampaignExecutionCompleted`)
 * is rendered as "System" rather than an empty/missing name
 * (docs/plans/20-observability-and-audit.md § Edge cases).
 */
export default class AuditLogTransformer extends BaseTransformer<AuditLog> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'organizationId',
        'projectId',
        'action',
        'entityType',
        'entityId',
        'metadata',
        'occurredAt',
      ]),
      actorName: this.resource.actor?.fullName ?? 'System',
    }
  }
}
