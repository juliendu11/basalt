import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type SegmentMembershipRemoved from '#events/segment_membership_removed'

/**
 * A contact leaving a segment (recompute, tag/field change, manual exclusion)
 * cancels its still-active enrollments that entered through that segment, so
 * its scheduled sends never go out. `advance()` also bails on a non-active
 * enrollment, which covers an execution already locked by a worker.
 */
export default class CancelEnrollmentsOnSegmentMembershipRemoved {
  async handle(event: SegmentMembershipRemoved) {
    if (event.contactIds.length === 0) return

    const enrollmentIds = await db
      .from('campaign_enrollments')
      .where('status', 'active')
      .where('source', `segment:${event.segmentId}`)
      .whereIn('contact_id', event.contactIds)
      .select('id')
      .then((rows) => rows.map((row) => row.id))
    if (enrollmentIds.length === 0) return

    const now = DateTime.now().toSQL({ includeOffset: false })

    await db
      .from('campaign_executions')
      .whereIn('campaign_enrollment_id', enrollmentIds)
      .whereIn('status', ['pending', 'waiting'])
      .update({ status: 'cancelled', finished_at: now })

    await db
      .from('campaign_enrollments')
      .whereIn('id', enrollmentIds)
      .update({ status: 'cancelled', exited_at: now, exit_reason: 'removed from segment' })
  }
}
