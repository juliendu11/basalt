import type { HttpContext } from '@adonisjs/core/http'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import Email from '#models/email'
import Segment from '#models/segment'
import Tag from '#models/tag'
import SmtpConnector from '#models/smtp_connector'
import CampaignPolicy from '#policies/campaign_policy'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import CampaignGraphTransformer from '#transformers/campaign_graph_transformer'
import CampaignTransformer from '#transformers/campaign_transformer'
import CampaignVersionTransformer from '#transformers/campaign_version_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const campaignBuilderService = new CampaignBuilderService()

export default class CampaignBuildersController {
  /**
   * Read-only load for display: shows the current draft if one exists,
   * otherwise previews the published version's graph — no version is
   * cloned/persisted here, so opening the builder and navigating away
   * without saving leaves the campaign untouched. Cloning a draft from the
   * published version is deferred to `save()`, the only place edits are
   * actually committed (docs/plans/11-campaign-builder.md § User flows).
   *
   * Accepts an optional `?versionId=` query param to load any OTHER
   * version of the campaign (published/archived, or even the draft itself)
   * for viewing inside the same canvas. Whenever the requested version
   * isn't the one that would normally be editable, the page is rendered
   * `readonly: true` — the frontend disables the canvas/palette/config
   * panel accordingly and offers a "Restore" action instead of "Save"
   * (`CampaignVersionsController#restore`).
   */
  async show({ project, params, request, inertia }: HttpContext) {
    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    let editableVersion: CampaignVersion
    if (campaign.draftVersionId) {
      editableVersion = await CampaignVersion.query()
        .where('id', campaign.draftVersionId)
        .firstOrFail()
    } else if (campaign.publishedVersionId) {
      editableVersion = await CampaignVersion.query()
        .where('id', campaign.publishedVersionId)
        .firstOrFail()
    } else {
      // Every campaign is created with an empty draft version #1
      // (CampaignService#createWithDraftVersion) — this branch is
      // structurally unreachable but kept as a defensive fallback rather
      // than a non-null assertion.
      editableVersion = await CampaignVersion.query()
        .where('campaignId', campaign.id)
        .orderBy('versionNumber', 'desc')
        .firstOrFail()
    }

    const requestedVersionId = request.input('versionId')
    const version = requestedVersionId
      ? await CampaignVersion.query()
          .where('campaignId', campaign.id)
          .where('id', requestedVersionId)
          .firstOrFail()
      : editableVersion

    const readonly = version.id !== editableVersion.id

    const versions = await CampaignVersion.query()
      .where('campaignId', campaign.id)
      .orderBy('versionNumber', 'desc')

    const nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    const edges = await CampaignEdge.query().where('campaignVersionId', version.id)

    const [emails, segments, tags, smtpConnectors] = await Promise.all([
      Email.query()
        .withScopes((s) => s.forProject(project))
        .select('id', 'name'),
      Segment.query()
        .withScopes((s) => s.forProject(project))
        .select('id', 'name'),
      Tag.query()
        .withScopes((s) => s.forProject(project))
        .select('id', 'name'),
      SmtpConnector.query()
        .withScopes((s) => s.forProject(project))
        .select('id', 'name'),
    ])

    return inertia.render('campaigns/builder', {
      project: ProjectTransformer.transform(project),
      campaign: CampaignTransformer.transform(campaign),
      versionId: version.id,
      readonly,
      versions: CampaignVersionTransformer.transform(versions),
      graph: CampaignGraphTransformer.transform(nodes, edges),
      emails: emails.map((e) => ({ id: e.id, name: e.name })),
      segments: segments.map((s) => ({ id: s.id, name: s.name })),
      tags: tags.map((t) => ({ id: t.id, name: t.name })),
      smtpConnectors: smtpConnectors.map((c) => ({ id: c.id, name: c.name })),
    })
  }

  /**
   * The only place a draft is actually created: if the campaign has none
   * yet, one is cloned from the published version here (or reused from the
   * guaranteed-draft-#1 case) before the submitted graph is persisted into
   * it — so a draft only comes into existence when the user explicitly
   * saves from the builder.
   */
  async save({ project, params, bouncer, auth, request, response }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('edit', project)

    const campaign = await Campaign.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.campaignId)
      .firstOrFail()

    let draftVersion: CampaignVersion
    if (campaign.draftVersionId) {
      draftVersion = await CampaignVersion.query()
        .where('id', campaign.draftVersionId)
        .firstOrFail()
    } else if (campaign.publishedVersionId) {
      const publishedVersion = await CampaignVersion.query()
        .where('id', campaign.publishedVersionId)
        .firstOrFail()
      draftVersion = await campaignBuilderService.cloneVersion(publishedVersion, auth.user!)
    } else {
      draftVersion = await CampaignVersion.query()
        .where('campaignId', campaign.id)
        .orderBy('versionNumber', 'desc')
        .firstOrFail()
    }

    const nodes = request.input('nodes', []) as BuilderNode[]
    const edges = request.input('edges', []) as BuilderEdge[]

    await campaignBuilderService.saveDraft(draftVersion, { nodes, edges })

    return response.json({ saved: true })
  }
}
