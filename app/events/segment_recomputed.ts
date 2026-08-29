import { BaseEvent } from '@adonisjs/core/events'

/** Emitted at the end of every full or targeted recompute, successful or not. */
export default class SegmentRecomputed extends BaseEvent {
  constructor(
    public segmentId: number,
    public addedCount: number,
    public removedCount: number,
    public durationMs: number
  ) {
    super()
  }
}
