import { BaseEvent } from '@adonisjs/core/events'
import type Campaign from '#models/campaign'
import type User from '#models/user'

export default class CampaignPaused extends BaseEvent {
  constructor(
    public campaign: Campaign,
    public actor: User
  ) {
    super()
  }
}
