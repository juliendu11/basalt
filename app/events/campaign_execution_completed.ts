import { BaseEvent } from '@adonisjs/core/events'

/**
 * System-triggered (no human actor — the engine acts with system
 * privileges, docs/plans/12-campaign-engine.md § Permissions/Security
 * considerations), unlike every other domain event in this codebase.
 */
export default class CampaignExecutionCompleted extends BaseEvent {
  constructor(
    public executionId: number,
    public enrollmentId: number
  ) {
    super()
  }
}
