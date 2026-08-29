import { BaseEvent } from '@adonisjs/core/events'
import type Campaign from '#models/campaign'

/**
 * Defined for the future `active -> completed` automatic-transition job
 * (docs/plans/10-campaigns.md § Domain concepts, § Jobs/Commands) — no such
 * job exists yet in this codebase (it depends on `campaign_enrollments`,
 * not implemented until docs/plans/13-campaign-enrollment.md), so this
 * event is never dispatched in this phase.
 */
export default class CampaignCompleted extends BaseEvent {
  constructor(public campaign: Campaign) {
    super()
  }
}
