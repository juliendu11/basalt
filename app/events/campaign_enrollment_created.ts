import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted when `CampaignEnrollmentService.enroll()` creates a new
 * enrollment (docs/plans/13-campaign-enrollment.md § Events). Carries only
 * IDs, deliberately lightweight (mirrors the campaign-execution lifecycle
 * events from Phase 10, dispatched on a hot path).
 */
export default class CampaignEnrollmentCreated extends BaseEvent {
  constructor(
    public enrollmentId: number,
    public campaignId: number,
    public contactId: number,
    public source: string
  ) {
    super()
  }
}
