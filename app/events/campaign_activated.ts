import { BaseEvent } from '@adonisjs/core/events'
import type Campaign from '#models/campaign'
import type User from '#models/user'

/**
 * Dispatched by `CampaignBuilderService.publish()` (docs/plans/11-campaign-builder.md)
 * exactly once per campaign, on its first-ever publication (`draft` ->
 * `active`) — never on a later republish, which keeps the campaign
 * `active` without re-firing this event.
 */
export default class CampaignActivated extends BaseEvent {
  constructor(
    public campaign: Campaign,
    public actor: User
  ) {
    super()
  }
}
