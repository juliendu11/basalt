import type { HttpContext } from '@adonisjs/core/http'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignPolicy from '#policies/campaign_policy'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import { createCampaignValidator, updateCampaignValidator } from '#validators/campaign'
import CampaignTransformer from '#transformers/campaign_transformer'
import CampaignVersionTransformer from '#transformers/campaign_version_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

const campaignService = new CampaignService()
const campaignBuilderService = new CampaignBuilderService()

export default class CampaignsController {
  async index({ project, inertia }: HttpContext) {
    const campaigns = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('createdAt', 'desc')

    return inertia.render('campaigns/index', {
      project: ProjectTransformer.transform(project),
      // `campaign_enrollments` doesn't exist yet (docs/plans/13-campaign-enrollment.md),
      // so no "contacts currently engaged" activity summary can be shown
      // yet (docs/plans/10-campaigns.md § Functional requirements) — the
      // list only carries name/status/dates for now.
      campaigns: CampaignTransformer.transform(campaigns),
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('create', project)

    return inertia.render('campaigns/create', {
      project: ProjectTransformer.transform(project),
    })
  }

  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('create', project)

    const payload = await request.validateUsing(createCampaignValidator)
    const campaign = await campaignService.create(project, auth.user!, payload)

    session.flash('success', `${campaign.name} was created.`)
    return response.redirect().toRoute('campaigns.builder.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      campaignId: campaign.id,
    })
  }

  async show({ project, params, inertia, response }: HttpContext) {
    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .first()

    if (!campaign) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    const versions = await CampaignVersion.query()
      .where('campaignId', campaign.id)
      .orderBy('versionNumber', 'desc')

    return inertia.render('campaigns/show', {
      project: ProjectTransformer.transform(project),
      campaign: CampaignTransformer.transform(campaign),
      versions: CampaignVersionTransformer.transform(versions),
    })
  }

  async update({ project, params, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('edit', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const payload = await request.validateUsing(updateCampaignValidator)
    campaign.name = payload.name
    await campaign.save()

    session.flash('success', 'Campaign renamed.')
    return response.redirect().back()
  }

  async duplicate({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('duplicate', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const copy = await campaignService.duplicate(campaign, auth.user!)

    session.flash('success', `${copy.name} was created.`)
    return response.redirect().toRoute('campaigns.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      campaignId: copy.id,
    })
  }

  /**
   * Publishes the campaign's current draft (docs/plans/11-campaign-builder.md
   * § Backend architecture: `CampaignBuilderService.publish()`) — validates
   * the graph structurally first, throwing a `BusinessRuleViolation` with
   * every collected error if invalid, never a partial publish.
   */
  async activate({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('activate', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const draftVersion = await CampaignVersion.query()
      .where('id', campaign.draftVersionId ?? 0)
      .first()

    if (!draftVersion) {
      throw new BusinessRuleViolation('This campaign has no draft to publish.')
    }

    await campaignBuilderService.publish(draftVersion, auth.user!)

    session.flash('success', `${campaign.name} was published.`)
    return response.redirect().back()
  }

  async pause({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('pause', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    await campaignService.pause(campaign, auth.user!)

    session.flash('success', 'Campaign paused.')
    return response.redirect().back()
  }

  async resume({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('resume', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    await campaignService.resume(campaign, auth.user!)

    session.flash('success', 'Campaign resumed.')
    return response.redirect().back()
  }

  async archive({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('archive', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    await campaignService.archive(campaign, auth.user!)

    session.flash('success', 'Campaign archived.')
    return response.redirect().back()
  }
}
