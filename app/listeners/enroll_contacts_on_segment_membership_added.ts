import db from '@adonisjs/lucid/services/db'
import type SegmentMembershipAdded from '#events/segment_membership_added'
import queueDispatcher from '#services/jobs/queue_dispatcher'

/**
 * Bridges Segments (Phase 7) to Campaign Enrollment (docs/plans/13-campaign-enrollment.md
 * § User flows): a batch of contacts newly matching a segment enqueues one
 * `campaign.enroll_batch` job per active campaign whose PUBLISHED version's
 * source node references that segment.
 *
 * The `config.segmentId` match uses a parameterized `JSON_UNQUOTE(JSON_EXTRACT(...))`
 * comparison, never a string-built query — same discipline as
 * `SegmentEvaluator`'s `customFields.*` queries (Phase 7). `segmentId` here
 * is an internal integer (never end-user input at this point), but the
 * codebase's established convention is to never interpolate anything into
 * raw SQL regardless, so this follows suit rather than special-casing
 * "trusted" values.
 */
export default class EnrollContactsOnSegmentMembershipAdded {
  async handle(event: SegmentMembershipAdded) {
    if (event.contactIds.length === 0) return

    const matchingCampaigns = await db
      .from('campaign_nodes')
      .join('campaign_versions', 'campaign_versions.id', 'campaign_nodes.campaign_version_id')
      .join('campaigns', 'campaigns.published_version_id', 'campaign_versions.id')
      .where('campaigns.status', 'active')
      .where('campaign_nodes.type', 'source')
      .where('campaign_nodes.subtype', 'segment')
      .whereRaw('JSON_UNQUOTE(JSON_EXTRACT(campaign_nodes.config, ?)) = ?', [
        '$.segmentId',
        String(event.segmentId),
      ])
      .select('campaigns.id as campaignId')

    for (const row of matchingCampaigns) {
      await queueDispatcher.dispatch('campaign-engine', 'campaign.enroll_batch', {
        campaignId: row.campaignId,
        segmentId: event.segmentId,
        contactIds: event.contactIds,
      })
    }
  }
}
