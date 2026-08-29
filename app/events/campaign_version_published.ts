import { BaseEvent } from '@adonisjs/core/events'
import type Campaign from '#models/campaign'
import type CampaignVersion from '#models/campaign_version'
import type User from '#models/user'

/**
 * Emitted by `CampaignBuilderService.publish()` (decisions/ADR-004-campaign-versioning.md).
 * Consumed by `AuditLogListener`; docs/plans/13-campaign-enrollment.md notes
 * no immediate handler is required in v1 (enrollment source is re-evaluated
 * at the next segment recompute instead).
 */
export default class CampaignVersionPublished extends BaseEvent {
  constructor(
    public campaign: Campaign,
    public version: CampaignVersion,
    public actor: User
  ) {
    super()
  }
}
