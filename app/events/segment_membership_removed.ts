import { BaseEvent } from '@adonisjs/core/events'

/** Emitted once per recompute batch when contacts leave a segment's membership. */
export default class SegmentMembershipRemoved extends BaseEvent {
  constructor(
    public segmentId: number,
    public contactIds: number[]
  ) {
    super()
  }
}
