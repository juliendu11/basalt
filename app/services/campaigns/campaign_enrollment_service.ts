import { DateTime } from 'luxon'
import type { Job } from 'bullmq'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Campaign from '#models/campaign'
import Contact from '#models/contact'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignExecution from '#models/campaign_execution'
import CampaignEnrollmentCreated from '#events/campaign_enrollment_created'
import queueDispatcher from '#services/jobs/queue_dispatcher'

const TERMINAL_ENROLLMENT_STATUSES = new Set(['completed', 'exited', 'cancelled'])

/**
 * `enroll()` implements the exact 8-step algorithm from
 * docs/plans/13-campaign-enrollment.md § Backend architecture — the bridge
 * between a segment gaining a member (Phase 7) and the Campaign Engine
 * actually running that contact through a published graph (Phase 10,
 * untouched by this service beyond enqueuing its first `advance()` job).
 */
export default class CampaignEnrollmentService {
  /**
   * @param segmentId the segment whose membership change triggered this
   *   call — used only to build the enrollment's `source` label, never
   *   re-validated against the campaign's actual source node here (that's
   *   the listener's job, before this method is ever called).
   */
  async enroll(campaign: Campaign, contact: Contact, segmentId: number): Promise<void> {
    // Step 1: a non-active campaign accepts no new enrollments — silently
    // (per the plan: "no-op journalisé"; a full audit-log entry would be
    // disproportionate for a per-contact, per-event decision this frequent,
    // so a debug-level log is the lightest sensible form).
    if (campaign.status !== 'active') {
      logger.debug(
        { campaignId: campaign.id, contactId: contact.id, campaignStatus: campaign.status },
        'campaign enrollment skipped: campaign not active'
      )
      return
    }

    // Step 2: only a subscribed contact can be enrolled (re-checked again,
    // independently, on every send_email node pass by the engine itself —
    // this is the enrollment-time gate, not the only gate).
    if (contact.status !== 'subscribed') {
      logger.debug(
        { campaignId: campaign.id, contactId: contact.id, contactStatus: contact.status },
        'campaign enrollment skipped: contact not eligible'
      )
      return
    }

    // Step 3: already actively engaged — no-op.
    const existingActive = await CampaignEnrollment.query()
      .withScopes((scopes) => scopes.activeFor(campaign, contact))
      .first()
    if (existingActive) return

    // Step 4: reentry policy. `never`/`after_exit` are expressed as written
    // in the plan even though `after_exit`'s "no non-terminal enrollment"
    // check is already implied by step 3 having found none `active` — the
    // plan treats them as two distinct, explicit checks rather than relying
    // on step 3 alone to carry `after_exit`'s intent.
    const priorEnrollments = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('contactId', contact.id)
      .orderBy('enrolledAt', 'desc')

    if (campaign.reentryPolicy === 'never' && priorEnrollments.length > 0) return

    if (campaign.reentryPolicy === 'after_exit') {
      const mostRecent = priorEnrollments[0]
      if (mostRecent && !TERMINAL_ENROLLMENT_STATUSES.has(mostRecent.status)) return
    }
    // 'always': no further check beyond step 3.

    if (!campaign.publishedVersionId) {
      // Structurally shouldn't happen (an 'active' campaign always has a
      // published version, per docs/plans/10-campaigns.md/11-campaign-builder.md),
      // but never silently enroll onto a null version.
      logger.warn(
        { campaignId: campaign.id },
        'active campaign has no publishedVersionId — skipping enrollment'
      )
      return
    }

    // Step 5: create enrollment + execution together, atomically.
    const { enrollment, execution } = await db.transaction(async (trx) => {
      const newEnrollment = await CampaignEnrollment.create(
        {
          projectId: campaign.projectId,
          campaignId: campaign.id,
          campaignVersionId: campaign.publishedVersionId!,
          contactId: contact.id,
          status: 'active',
          source: `segment:${segmentId}`,
          enrolledAt: DateTime.now(),
        },
        { client: trx }
      )

      const newExecution = await CampaignExecution.create(
        {
          campaignEnrollmentId: newEnrollment.id,
          status: 'pending',
          scheduledAt: DateTime.now(),
        },
        { client: trx }
      )

      return { enrollment: newEnrollment, execution: newExecution }
    })

    // Step 6.
    await CampaignEnrollmentCreated.dispatch(
      enrollment.id,
      campaign.id,
      contact.id,
      enrollment.source
    )

    // Step 7.
    await queueDispatcher.dispatch('campaign-engine', 'campaign-engine.advance', {
      executionId: execution.id,
    })
  }
}

export interface EnrollBatchPayload {
  campaignId: number
  /** The segment whose membership change triggered this batch — every contact in it shares this source. */
  segmentId: number
  contactIds: number[]
}

/**
 * Registered as the `campaign-engine:campaign.enroll_batch` handler
 * (start/jobs.ts). Each contact is processed independently — one contact
 * failing (e.g. an unexpected error inside `enroll()`) must never abort the
 * rest of the batch (docs/plans/13-campaign-enrollment.md § Jobs/Commands:
 * "chaque contact traité indépendamment dans sa propre mini-transaction").
 */
export async function enrollBatchJob(
  payload: EnrollBatchPayload,
  _job: Job<EnrollBatchPayload>
): Promise<void> {
  const campaign = await Campaign.find(payload.campaignId)
  if (!campaign) return // the campaign was deleted after this job was enqueued

  const service = new CampaignEnrollmentService()

  for (const contactId of payload.contactIds) {
    try {
      const contact = await Contact.find(contactId)
      if (!contact) continue // soft/hard-deleted since enqueueing

      await service.enroll(campaign, contact, payload.segmentId)
    } catch (error) {
      logger.error(
        { err: error, campaignId: campaign.id, contactId },
        'campaign enrollment failed for one contact in a batch — continuing with the rest'
      )
    }
  }
}
