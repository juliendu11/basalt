import type { HttpContext } from '@adonisjs/core/http'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import CampaignPolicy from '#policies/campaign_policy'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import CampaignGraphTransformer from '#transformers/campaign_graph_transformer'
import CampaignTransformer from '#transformers/campaign_transformer'
import CampaignVersionTransformer from '#transformers/campaign_version_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

const campaignBuilderService = new CampaignBuilderService()

export default class CampaignVersionsController {
  /** Read-only view of an archived/published version's graph (docs/plans/11-campaign-builder.md § Routes). */
  async show({ project, params, inertia }: HttpContext) {
    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const version = await CampaignVersion.query()
      .where('campaignId', campaign.id)
      .where('id', params.versionId)
      .firstOrFail()

    const nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    const edges = await CampaignEdge.query().where('campaignVersionId', version.id)

    return inertia.render('campaigns/version', {
      project: ProjectTransformer.transform(project),
      campaign: CampaignTransformer.transform(campaign),
      version: CampaignVersionTransformer.transform(version),
      graph: CampaignGraphTransformer.transform(nodes, edges),
    })
  }

  /**
   * Restores a published/archived version by cloning its graph into a
   * fresh draft (`CampaignBuilderService.cloneVersion` — same mechanics
   * used to resume editing after a publish), which becomes the campaign's
   * new `draftVersionId`. The source version itself is untouched.
   */
  async restore({ project, params, bouncer, auth, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('edit', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const sourceVersion = await CampaignVersion.query()
      .where('campaignId', campaign.id)
      .where('id', params.versionId)
      .firstOrFail()

    if (sourceVersion.status === 'draft') {
      throw new BusinessRuleViolation('This version is already the editable draft.')
    }

    await campaignBuilderService.cloneVersion(sourceVersion, auth.user!)

    session.flash('success', `Version #${sourceVersion.versionNumber} was restored as the draft.`)
    return response.redirect().toRoute('campaigns.builder.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      campaignId: campaign.id,
    })
  }

  /** Discards a draft version (`CampaignBuilderService.deleteDraft`) without publishing it. */
  async destroy({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('edit', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    const version = await CampaignVersion.query()
      .where('campaignId', campaign.id)
      .where('id', params.versionId)
      .firstOrFail()

    await campaignBuilderService.deleteDraft(version)

    session.flash('success', `Version #${version.versionNumber} was deleted.`)
    return response.redirect().toRoute('campaigns.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      campaignId: campaign.id,
    })
  }
}
