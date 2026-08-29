import { BaseEvent } from '@adonisjs/core/events'

/**
 * Emitted once per recompute batch (not once per contact) when contacts
 * enter a segment's membership (docs/plans/06-segments.md § Backend
 * architecture). The key event consumed by campaign enrollment
 * (docs/plans/13-campaign-enrollment.md) to trigger enrollment of contacts
 * newly matching a campaign's source segment.
 */
export default class SegmentMembershipAdded extends BaseEvent {
  constructor(
    public segmentId: number,
    public contactIds: number[]
  ) {
    super()
  }
}
