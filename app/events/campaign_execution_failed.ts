import { BaseEvent } from '@adonisjs/core/events'

/** System-triggered — see `CampaignExecutionCompleted`'s doc comment. */
export default class CampaignExecutionFailed extends BaseEvent {
  constructor(
    public executionId: number,
    public enrollmentId: number,
    public reason: string
  ) {
    super()
  }
}
