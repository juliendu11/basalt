import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import type Project from '#models/project'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignPaused from '#events/campaign_paused'
import CampaignResumed from '#events/campaign_resumed'
import CampaignArchived from '#events/campaign_archived'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'

export interface CampaignPayload {
  name: string
  description?: string | null
  reentryPolicy?: 'never' | 'after_exit' | 'always'
  enrollExistingMembers?: boolean
}

const ARCHIVABLE_STATUSES = new Set(['draft', 'active', 'paused', 'completed'])

const campaignBuilderService = new CampaignBuilderService()

export default class CampaignService {
  /**
   * Transaction: creates the `Campaign` plus its first, empty
   * `CampaignVersion` (draft, docs/plans/decisions/ADR-004-campaign-versioning.md)
   * and points `campaigns.draftVersionId` at it.
   */
  async create(project: Project, actor: User, payload: CampaignPayload): Promise<Campaign> {
    return this.#createWithDraftVersion(project.id, actor, {
      name: payload.name,
      description: payload.description ?? null,
      reentryPolicy: payload.reentryPolicy ?? 'never',
      enrollExistingMembers: payload.enrollExistingMembers ?? false,
    })
  }

  /**
   * New `Campaign` (status='draft'), never linked back to the original.
   * Per docs/plans/10-campaigns.md § Services, clones the graph
   * (nodes/edges) of the source's currently-displayed version (published if
   * it exists, else draft) via `CampaignBuilderService.cloneVersionIntoCampaign`
   * — the clone is a frozen copy (including any already-frozen `send_email`
   * node `config`), never a live reference to the original.
   */
  async duplicate(campaign: Campaign, actor: User): Promise<Campaign> {
    return db.transaction(async (trx) => {
      const copy = await Campaign.create(
        {
          projectId: campaign.projectId,
          name: `${campaign.name} (copie)`,
          description: campaign.description,
          status: 'draft',
          reentryPolicy: campaign.reentryPolicy,
          enrollExistingMembers: campaign.enrollExistingMembers,
        },
        { client: trx }
      )

      const sourceVersionId = campaign.publishedVersionId ?? campaign.draftVersionId
      const sourceVersion = await CampaignVersion.query({ client: trx })
        .where('id', sourceVersionId!)
        .firstOrFail()

      await campaignBuilderService.cloneVersionIntoCampaign(sourceVersion, copy, actor, trx)

      return copy
    })
  }

  async #createWithDraftVersion(
    projectId: number,
    actor: User,
    payload: {
      name: string
      description: string | null
      reentryPolicy: 'never' | 'after_exit' | 'always'
      enrollExistingMembers: boolean
    }
  ): Promise<Campaign> {
    return db.transaction(async (trx) => {
      const campaign = await Campaign.create(
        {
          projectId,
          name: payload.name,
          description: payload.description,
          status: 'draft',
          reentryPolicy: payload.reentryPolicy,
          enrollExistingMembers: payload.enrollExistingMembers,
        },
        { client: trx }
      )

      const version = await CampaignVersion.create(
        {
          campaignId: campaign.id,
          versionNumber: 1,
          status: 'draft',
          graphFormatVersion: 1,
          createdByUserId: actor.id,
        },
        { client: trx }
      )

      campaign.draftVersionId = version.id
      await campaign.useTransaction(trx).save()

      return campaign
    })
  }

  /**
   * Idempotent: pausing an already-`paused` campaign is a no-op (no event
   * emitted). Only a currently-`active` campaign can be paused.
   */
  async pause(campaign: Campaign, actor: User): Promise<Campaign> {
    if (campaign.status === 'paused') return campaign

    if (campaign.status !== 'active') {
      throw new BusinessRuleViolation(
        `A campaign can only be paused from "active" (currently "${campaign.status}").`
      )
    }

    campaign.status = 'paused'
    await campaign.save()

    await CampaignPaused.dispatch(campaign, actor)

    return campaign
  }

  /**
   * Idempotent: resuming an already-`active` campaign is a no-op. Only a
   * currently-`paused` campaign can be resumed. Per docs/plans/10-campaigns.md
   * § User flows, `campaign_executions` due for a re-evaluation on resume
   * are handled by the Campaign Engine's worker loop (docs/plans/12-campaign-engine.md,
   * not implemented yet) — nothing to do here beyond the status transition.
   */
  async resume(campaign: Campaign, actor: User): Promise<Campaign> {
    if (campaign.status === 'active') return campaign

    if (campaign.status !== 'paused') {
      throw new BusinessRuleViolation(
        `A campaign can only be resumed from "paused" (currently "${campaign.status}").`
      )
    }

    campaign.status = 'active'
    await campaign.save()

    await CampaignResumed.dispatch(campaign, actor)

    return campaign
  }

  /**
   * A `draft` campaign (never activated) archives directly — nothing to
   * cancel. Cancelling in-flight `campaign_enrollments`/`campaign_executions`
   * (docs/plans/10-campaigns.md § Services) is deferred: those tables don't
   * exist yet in this codebase (docs/plans/13-campaign-enrollment.md,
   * docs/plans/12-campaign-engine.md) — same deferral pattern as
   * `ContactService.softDelete`'s enrollment-cascade note.
   */
  async archive(campaign: Campaign, actor: User): Promise<Campaign> {
    if (campaign.status === 'archived') return campaign

    if (!ARCHIVABLE_STATUSES.has(campaign.status)) {
      throw new BusinessRuleViolation(
        `A campaign in status "${campaign.status}" can't be archived.`
      )
    }

    campaign.status = 'archived'
    await campaign.save()

    await CampaignArchived.dispatch(campaign, actor)

    return campaign
  }
}
