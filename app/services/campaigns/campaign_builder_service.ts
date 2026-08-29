import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type User from '#models/user'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import Email from '#models/email'
import Segment from '#models/segment'
import Tag from '#models/tag'
import SmtpConnector from '#models/smtp_connector'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import CampaignVersionPublished from '#events/campaign_version_published'
import CampaignActivated from '#events/campaign_activated'
import { validateGraph } from '#services/campaigns/campaign_graph_validator'
import { validateNodeConfig, CampaignNodeConfigError } from '#validators/campaign_node'
import { composeEmailHtml, composeEmailText } from '#services/emails/email_layout_composer'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

export interface SaveDraftPayload {
  nodes: BuilderNode[]
  edges: BuilderEdge[]
}

/**
 * `saveDraft`/`publish`/`cloneVersion` for the campaign graph
 * (docs/plans/11-campaign-builder.md § Backend architecture,
 * decisions/ADR-001-campaign-graph-storage.md).
 */
export default class CampaignBuilderService {
  /**
   * Diffs the incoming `{ nodes, edges }` payload against the version's
   * current rows by `client_key` (nodes) / `(sourceClientKey,
   * targetClientKey, sourceHandle)` (edges), applying upserts/deletes in one
   * transaction (ADR-001 § Consequences). Refuses to write to a
   * non-`draft` version — this is enforced here, not just in the UI
   * (docs/plans/11-campaign-builder.md § Security considerations).
   */
  async saveDraft(version: CampaignVersion, payload: SaveDraftPayload): Promise<void> {
    if (version.status !== 'draft') {
      throw new BusinessRuleViolation('Only a draft version can be edited.')
    }

    await this.#validateReferences(version.campaignId, payload.nodes)

    await db.transaction(async (trx) => {
      const existingNodes = await CampaignNode.query({ client: trx }).where(
        'campaignVersionId',
        version.id
      )
      const existingByKey = new Map(existingNodes.map((n) => [n.clientKey, n]))
      const payloadKeys = new Set(payload.nodes.map((n) => n.clientKey))

      const nodeIdByClientKey = new Map<string, number>()

      for (const node of payload.nodes) {
        const existing = existingByKey.get(node.clientKey)

        if (existing) {
          existing.useTransaction(trx)
          existing.merge({
            type: node.type,
            subtype: node.subtype,
            config: node.config,
            positionX: node.position.x,
            positionY: node.position.y,
          })
          await existing.save()
          nodeIdByClientKey.set(node.clientKey, existing.id)
        } else {
          const created = await CampaignNode.create(
            {
              campaignVersionId: version.id,
              clientKey: node.clientKey,
              type: node.type,
              subtype: node.subtype,
              config: node.config,
              positionX: node.position.x,
              positionY: node.position.y,
            },
            { client: trx }
          )
          nodeIdByClientKey.set(node.clientKey, created.id)
        }
      }

      const staleNodes = existingNodes.filter((n) => !payloadKeys.has(n.clientKey))
      for (const stale of staleNodes) {
        await stale.useTransaction(trx).delete()
      }

      // Edges are simplest to fully replace rather than diffed row-by-row —
      // there is no natural persistent identity for an edge beyond its
      // endpoints/handle (unlike nodes, which have `client_key`), and the
      // volumes involved (dozens of edges per graph) make a full
      // delete+reinsert both correct and cheap.
      await CampaignEdge.query({ client: trx }).where('campaignVersionId', version.id).delete()

      for (const edge of payload.edges) {
        const sourceNodeId = nodeIdByClientKey.get(edge.sourceClientKey)
        const targetNodeId = nodeIdByClientKey.get(edge.targetClientKey)
        if (!sourceNodeId || !targetNodeId) {
          throw new BusinessRuleViolation(
            `Edge references an unknown node ("${edge.sourceClientKey}" -> "${edge.targetClientKey}").`
          )
        }

        await CampaignEdge.create(
          {
            campaignVersionId: version.id,
            sourceNodeId,
            targetNodeId,
            sourceHandle: edge.sourceHandle,
          },
          { client: trx }
        )
      }
    })
  }

  /**
   * 1) Validates the graph structurally, throwing with every collected
   * error if invalid. 2) Freezes `send_email` node content from the
   * referenced `Email` (ADR-004 § Consequences). 3) Transaction: archives
   * the previous published version (if any), publishes this one, updates
   * `campaigns.draftVersionId`/`publishedVersionId`, transitions the
   * campaign to `active` on first publish. Guards against a concurrent
   * double-publish via a conditional UPDATE (`WHERE status = 'draft'`)
   * rather than trusting the in-memory `version.status`.
   */
  async publish(version: CampaignVersion, actor: User): Promise<CampaignVersion> {
    const nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    const edges = await CampaignEdge.query().where('campaignVersionId', version.id)

    const errors = validateGraph(nodes, edges)
    if (errors.length > 0) {
      throw new BusinessRuleViolation(
        `The graph is invalid: ${errors.map((e) => e.message).join('; ')}`
      )
    }

    const sendEmailNodes = nodes.filter((n) => n.subtype === 'send_email')
    const emailIds = sendEmailNodes.map((n) => n.config.emailId as number)
    const emails =
      emailIds.length > 0
        ? await Email.query().whereIn('id', emailIds).preload('emailLayout')
        : ([] as Email[])
    const emailsById = new Map(emails.map((e) => [e.id, e]))

    return db.transaction(async (trx) => {
      for (const node of sendEmailNodes) {
        const email = emailsById.get(node.config.emailId as number)
        if (!email) {
          throw new BusinessRuleViolation(`send_email node references a missing Email.`)
        }

        node.useTransaction(trx)
        node.config = {
          ...node.config,
          subject: email.subject,
          // Composed from the live EmailLayout frame + email.bodyContent
          // when layout-linked (email_layout_composer.ts) — this is the
          // freeze point: the branding frame stops being "live" for this
          // node the instant this snapshot is taken
          // (decisions/ADR-004-campaign-versioning.md). textContent gets the
          // same treatment via the layout's own text frame.
          htmlContent: composeEmailHtml(email, email.emailLayout ?? null),
          textContent: composeEmailText(email, email.emailLayout ?? null),
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          replyTo: email.replyTo,
        }
        await node.save()
      }

      const affected = await CampaignVersion.query({ client: trx })
        .where('id', version.id)
        .where('status', 'draft')
        .update({
          status: 'published',
          // The query-builder `.update()` path (unlike a model's `.save()`)
          // bypasses `@column.dateTime()`'s automatic serialization, so the
          // MySQL-compatible string has to be built explicitly here —
          // `includeOffset: false` matters: MariaDB's DATETIME rejects a
          // trailing `+00:00` offset suffix.
          publishedAt: DateTime.now().toSQL({ includeOffset: false }),
        })

      if (toAffectedCount(affected) === 0) {
        throw new BusinessRuleViolation(
          'This draft was already published (possibly by a concurrent request).'
        )
      }

      const campaign = await Campaign.query({ client: trx })
        .where('id', version.campaignId)
        .firstOrFail()

      if (campaign.publishedVersionId) {
        await CampaignVersion.query({ client: trx })
          .where('id', campaign.publishedVersionId)
          .update({ status: 'archived' })
      }

      campaign.publishedVersionId = version.id
      campaign.draftVersionId = null
      const isFirstActivation = campaign.status === 'draft'
      if (isFirstActivation) {
        campaign.status = 'active'
      }
      campaign.useTransaction(trx)
      await campaign.save()

      await version.refresh()

      await CampaignVersionPublished.dispatch(campaign, version, actor)
      if (isFirstActivation) {
        await CampaignActivated.dispatch(campaign, actor)
      }

      return version
    })
  }

  /**
   * Discards a draft version outright — deletes its nodes/edges and the
   * version row itself, clearing `campaigns.draftVersionId`. Refused when
   * the campaign has no published version to fall back to, since every
   * campaign must always have at least one version
   * (`CampaignBuildersController.show`'s defensive fallback relies on this).
   */
  async deleteDraft(version: CampaignVersion): Promise<void> {
    if (version.status !== 'draft') {
      throw new BusinessRuleViolation('Only a draft version can be deleted.')
    }

    await db.transaction(async (trx) => {
      const campaign = await Campaign.query({ client: trx })
        .where('id', version.campaignId)
        .firstOrFail()

      if (!campaign.publishedVersionId) {
        throw new BusinessRuleViolation(
          'This draft cannot be deleted — a campaign must always have at least one version.'
        )
      }

      await CampaignEdge.query({ client: trx }).where('campaignVersionId', version.id).delete()
      await CampaignNode.query({ client: trx }).where('campaignVersionId', version.id).delete()

      version.useTransaction(trx)
      await version.delete()

      campaign.draftVersionId = null
      campaign.useTransaction(trx)
      await campaign.save()
    })
  }

  /**
   * Copies every node (new `id`s, same `client_key`s) and edge from
   * `sourceVersion` into a new `draft` `CampaignVersion` of the SAME
   * campaign — used when editing resumes after a publish
   * (`CampaignBuilderController.show`).
   */
  async cloneVersion(sourceVersion: CampaignVersion, actor: User): Promise<CampaignVersion> {
    return db.transaction(async (trx) => {
      const campaign = await Campaign.query({ client: trx })
        .where('id', sourceVersion.campaignId)
        .firstOrFail()

      const draft = await this.#cloneGraphRows(sourceVersion, campaign.id, actor.id, trx)

      campaign.draftVersionId = draft.id
      campaign.useTransaction(trx)
      await campaign.save()

      return draft
    })
  }

  /**
   * Same graph-cloning mechanics as `cloneVersion`, but targeting a
   * DIFFERENT (newly created) campaign — used by `CampaignService.duplicate`
   * (docs/plans/10-campaigns.md § Services: "clone the graph of the source's
   * currently-displayed version"). The clone is never linked back to the
   * original campaign/version afterward.
   *
   * Accepts an optional pre-opened transaction so `CampaignService.duplicate`
   * (which also creates the target `Campaign` row) can make the whole
   * operation atomic, rather than this method silently opening its own
   * separate transaction (same pattern as `OrganizationService.create`).
   */
  async cloneVersionIntoCampaign(
    sourceVersion: CampaignVersion,
    targetCampaign: Campaign,
    actor: User,
    trx?: TransactionClientContract
  ): Promise<CampaignVersion> {
    const run = async (client: TransactionClientContract) => {
      const draft = await this.#cloneGraphRows(sourceVersion, targetCampaign.id, actor.id, client)

      targetCampaign.draftVersionId = draft.id
      targetCampaign.useTransaction(client)
      await targetCampaign.save()

      return draft
    }

    return trx ? run(trx) : db.transaction(run)
  }

  async #cloneGraphRows(
    sourceVersion: CampaignVersion,
    targetCampaignId: number,
    createdByUserId: number,
    trx: TransactionClientContract
  ): Promise<CampaignVersion> {
    const latestVersion = await CampaignVersion.query({ client: trx })
      .where('campaignId', targetCampaignId)
      .orderBy('versionNumber', 'desc')
      .first()
    const latestVersionNumber = latestVersion?.versionNumber ?? 0

    const draft = await CampaignVersion.create(
      {
        campaignId: targetCampaignId,
        versionNumber: latestVersionNumber + 1,
        status: 'draft',
        graphFormatVersion: sourceVersion.graphFormatVersion,
        createdByUserId,
      },
      { client: trx }
    )

    const sourceNodes = await CampaignNode.query({ client: trx }).where(
      'campaignVersionId',
      sourceVersion.id
    )
    const sourceEdges = await CampaignEdge.query({ client: trx }).where(
      'campaignVersionId',
      sourceVersion.id
    )

    const newIdByOldId = new Map<number, number>()
    for (const node of sourceNodes) {
      const clone = await CampaignNode.create(
        {
          campaignVersionId: draft.id,
          clientKey: node.clientKey,
          type: node.type,
          subtype: node.subtype,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        },
        { client: trx }
      )
      newIdByOldId.set(node.id, clone.id)
    }

    for (const edge of sourceEdges) {
      const sourceNodeId = newIdByOldId.get(edge.sourceNodeId)
      const targetNodeId = newIdByOldId.get(edge.targetNodeId)
      if (!sourceNodeId || !targetNodeId) continue

      await CampaignEdge.create(
        {
          campaignVersionId: draft.id,
          sourceNodeId,
          targetNodeId,
          sourceHandle: edge.sourceHandle,
        },
        { client: trx }
      )
    }

    return draft
  }

  /**
   * Shape-validates every node's `config` (per subtype) and, for every
   * `emailId`/`segmentId`/`tagId`/`smtpConnectorId` reference found,
   * confirms the referenced row belongs to the SAME project as the
   * campaign — a malicious payload referencing another project's entity is
   * rejected here, not silently accepted (docs/plans/11-campaign-builder.md
   * § Security considerations). Batches lookups per entity type to avoid
   * N+1 queries.
   */
  async #validateReferences(campaignId: number, nodes: BuilderNode[]): Promise<void> {
    const configErrors: string[] = []
    for (const node of nodes) {
      try {
        await validateNodeConfig(node.subtype, node.config)
      } catch (error) {
        if (error instanceof CampaignNodeConfigError) {
          configErrors.push(`Node "${node.clientKey}": ${error.message}`)
        } else {
          throw error
        }
      }
    }
    if (configErrors.length > 0) {
      throw new BusinessRuleViolation(`Invalid node configuration: ${configErrors.join('; ')}`)
    }

    const campaign = await Campaign.query().where('id', campaignId).firstOrFail()
    const projectId = campaign.projectId

    const emailIds = collectIds(nodes, ['send_email'], 'emailId')
    const segmentIds = collectIds(
      nodes,
      ['segment', 'add_to_segment', 'remove_from_segment', 'in_segment'],
      'segmentId'
    )
    const tagIds = collectIds(nodes, ['add_tag', 'remove_tag'], 'tagId')
    const smtpConnectorIds = collectIds(nodes, ['send_email'], 'smtpConnectorId')

    await this.#assertBelongsToProject(Email, emailIds, projectId, 'Email')
    await this.#assertBelongsToProject(Segment, segmentIds, projectId, 'Segment')
    await this.#assertBelongsToProject(Tag, tagIds, projectId, 'Tag')
    await this.#assertBelongsToProject(SmtpConnector, smtpConnectorIds, projectId, 'SMTP connector')
  }

  async #assertBelongsToProject(
    Model: typeof Email | typeof Segment | typeof Tag | typeof SmtpConnector,
    ids: number[],
    projectId: number,
    label: string
  ): Promise<void> {
    if (ids.length === 0) return

    const rows = await Model.query().whereIn('id', ids).where('projectId', projectId)
    if (rows.length !== new Set(ids).size) {
      throw new BusinessRuleViolation(
        `A node references a ${label} that doesn't belong to this project.`
      )
    }
  }
}

function collectIds(nodes: BuilderNode[], subtypes: string[], key: string): number[] {
  const ids: number[] = []
  for (const node of nodes) {
    if (!subtypes.includes(node.subtype)) continue
    const value = node.config[key]
    if (typeof value === 'number') ids.push(value)
  }
  return ids
}

/**
 * Lucid's `.update()` resolves to a MySQL-driver-specific shape (a plain
 * affected-row count for this project's mysql2 connection) — normalized
 * here rather than trusted blindly, since the whole point of this check is
 * to detect the "0 rows affected" concurrent-publish race.
 */
function toAffectedCount(result: unknown): number {
  if (typeof result === 'number') return result
  if (Array.isArray(result)) return typeof result[0] === 'number' ? result[0] : result.length
  return 0
}
