import logger from '@adonisjs/core/services/logger'
import CampaignNode from '#models/campaign_node'
import SegmentContact from '#models/segment_contact'
import type CampaignActivated from '#events/campaign_activated'
import queueDispatcher from '#services/jobs/queue_dispatcher'

const BATCH_SIZE = 5000

/**
 * Closes the gap documented in docs/plans/13-campaign-enrollment.md § Edge
 * cases / Open questions: a contact that already belonged to a campaign's
 * source segment *before* the campaign's first activation never receives a
 * `SegmentMembershipAdded` event for it (that event only fires for members
 * newly inserted into `segment_contacts` — see `SegmentRecomputeService`),
 * so `EnrollContactsOnSegmentMembershipAdded` never sees them and they'd
 * otherwise never be enrolled.
 *
 * Opt-in per campaign (`campaigns.enroll_existing_members`, set on the
 * campaign creation form — docs/plans/10-campaigns.md) — off by default,
 * same "safest default" reasoning as `reentry_policy`, since it changes who
 * gets enrolled compared to every other campaign.
 *
 * On `CampaignActivated` (first publish only, per that event's own
 * contract), this simulates the missed `SegmentMembershipAdded` for every
 * contact already in the segment at that moment, batched the same way a
 * real segment recompute would batch it. Reuses `enrollBatchJob` /
 * `CampaignEnrollmentService.enroll()` as-is — same eligibility checks
 * (subscribed, not already active, reentry policy) apply, so nothing here
 * bypasses those rules.
 */
export default class EnrollExistingSegmentMembersOnCampaignActivated {
  async handle(event: CampaignActivated) {
    const campaign = event.campaign
    if (!campaign.enrollExistingMembers) return
    if (!campaign.publishedVersionId) return

    const sourceNode = await CampaignNode.query()
      .where('campaignVersionId', campaign.publishedVersionId)
      .where('type', 'source')
      .where('subtype', 'segment')
      .first()
    if (!sourceNode) return

    const segmentId = sourceNode.config.segmentId
    if (typeof segmentId !== 'number') {
      logger.warn(
        { campaignId: campaign.id, nodeId: sourceNode.id },
        'campaign source node has no numeric segmentId — skipping existing-member enrollment'
      )
      return
    }

    let lastId = 0
    for (;;) {
      const batch = await SegmentContact.query()
        .where('segmentId', segmentId)
        .where('id', '>', lastId)
        .orderBy('id', 'asc')
        .limit(BATCH_SIZE)
        .select('id', 'contactId')

      if (batch.length === 0) break
      lastId = batch[batch.length - 1].id

      await queueDispatcher.dispatch('campaign-engine', 'campaign.enroll_batch', {
        campaignId: campaign.id,
        segmentId,
        contactIds: batch.map((row) => row.contactId),
      })

      if (batch.length < BATCH_SIZE) break
    }
  }
}
