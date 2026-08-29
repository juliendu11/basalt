import type { DateTime } from 'luxon'
import type Contact from '#models/contact'
import type Campaign from '#models/campaign'
import Project from '#models/project'
import CampaignEnrollment from '#models/campaign_enrollment'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'

/**
 * Projects the emails a campaign engine execution is *going* to send next,
 * without running the engine. An in-flight send is a `campaign_execution`
 * in `pending`/`waiting` state parked on `currentNodeId` with `scheduledAt`
 * = its next run time; from there we walk the frozen published graph
 * (`campaign_nodes` + `campaign_edges`) forward, accumulating `wait` node
 * durations into an ETA, until we hit `send_email` nodes.
 *
 * `certainty`:
 *  - `scheduled`  — the ETA is the engine's own `scheduledAt` (or a plain
 *    chain of it); nothing was assumed.
 *  - `estimated`  — a `wait` not yet computed by the engine was projected,
 *    or a `condition` node was traversed by following its first outgoing
 *    edge (the real branch depends on runtime state).
 *
 * This never re-reads the live `Email`: `send_email` nodes carry a frozen
 * `config` (subject/emailId) copied at publish time, same source the
 * executor itself uses.
 */

export interface UpcomingSend {
  campaignId: number
  campaignName: string
  campaignStatus: string
  contactId: number
  contactEmail: string
  nodeId: number
  emailId: number | null
  subject: string | null
  estimatedSendAt: DateTime
  certainty: 'scheduled' | 'estimated'
}

interface Graph {
  nodesById: Map<number, CampaignNode>
  edgesBySource: Map<number, CampaignEdge[]>
  sourceNodeId: number | null
}

interface WalkInput {
  startNodeId: number
  startEta: DateTime
  skipFirstWait: boolean
  graph: Graph
  zone: string
  campaign: { id: number; name: string; status: string }
  contact: { id: number; email: string }
}

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

/** Hop guard — a published graph is validated, but a cycle through a condition loop is still possible. */
const MAX_STEPS = 200
/** Cap on how many future sends we list per execution, so a long drip sequence can't blow up a page. */
const MAX_SENDS_PER_EXECUTION = 20
/** Cap on executions scanned for a single campaign's projection (pragmatic, mirrors ContactHistoryService). */
const MAX_EXECUTIONS_PER_CAMPAIGN = 2000

const CONDITION_SUBTYPES = new Set(['contact_field', 'in_segment', 'email_opened', 'email_clicked'])

export default class UpcomingSendsService {
  /** Every upcoming send across the contact's still-active enrollments, earliest first. */
  async forContact(contact: Contact): Promise<UpcomingSend[]> {
    const enrollments = await CampaignEnrollment.query()
      .where('contactId', contact.id)
      .where('status', 'active')
      .preload('campaign')
      .preload('execution')

    const live = enrollments.filter(
      (e) => e.execution && (e.execution.status === 'pending' || e.execution.status === 'waiting')
    )
    if (live.length === 0) return []

    const graphs = await this.#loadGraphs([...new Set(live.map((e) => e.campaignVersionId))])
    const project = await Project.findOrFail(contact.projectId)

    const out: UpcomingSend[] = []
    for (const enrollment of live) {
      const graph = graphs.get(enrollment.campaignVersionId)
      if (!graph) continue

      const execution = enrollment.execution
      const startNodeId = execution.currentNodeId ?? graph.sourceNodeId
      if (startNodeId === null) continue

      out.push(
        ...this.#walk({
          startNodeId,
          startEta: execution.scheduledAt,
          skipFirstWait: execution.status === 'waiting',
          graph,
          zone: project.timezone,
          campaign: enrollment.campaign,
          contact: { id: contact.id, email: contact.email },
        })
      )
    }

    out.sort((a, b) => a.estimatedSendAt.toMillis() - b.estimatedSendAt.toMillis())
    return out
  }

  /** Upcoming sends for a whole campaign (its published version), paginated, earliest first. */
  async forCampaign(
    campaign: Campaign,
    page = 1,
    perPage = 50
  ): Promise<{ data: UpcomingSend[]; page: number; perPage: number; hasMore: boolean }> {
    const versionId = campaign.publishedVersionId
    if (!versionId) return { data: [], page, perPage, hasMore: false }

    const graphs = await this.#loadGraphs([versionId])
    const graph = graphs.get(versionId)
    if (!graph) return { data: [], page, perPage, hasMore: false }

    const project = await Project.findOrFail(campaign.projectId)

    const enrollments = await CampaignEnrollment.query()
      .where('campaignId', campaign.id)
      .where('status', 'active')
      .preload('contact')
      .preload('execution')
      .orderBy('id', 'asc')
      .limit(MAX_EXECUTIONS_PER_CAMPAIGN)

    const all: UpcomingSend[] = []
    for (const enrollment of enrollments) {
      const execution = enrollment.execution
      if (!execution || (execution.status !== 'pending' && execution.status !== 'waiting')) continue
      if (enrollment.contact.deletedAt) continue

      const startNodeId = execution.currentNodeId ?? graph.sourceNodeId
      if (startNodeId === null) continue

      all.push(
        ...this.#walk({
          startNodeId,
          startEta: execution.scheduledAt,
          skipFirstWait: execution.status === 'waiting',
          graph,
          zone: project.timezone,
          campaign,
          contact: { id: enrollment.contact.id, email: enrollment.contact.email },
        })
      )
    }

    all.sort((a, b) => a.estimatedSendAt.toMillis() - b.estimatedSendAt.toMillis())

    const start = (page - 1) * perPage
    return {
      data: all.slice(start, start + perPage),
      page,
      perPage,
      hasMore: all.length > start + perPage,
    }
  }

  #walk(input: WalkInput): UpcomingSend[] {
    const { graph, campaign, contact } = input
    const results: UpcomingSend[] = []
    const visited = new Set<number>()

    let currentId: number | null = input.startNodeId
    let eta = input.startEta
    let certainty: UpcomingSend['certainty'] = 'scheduled'

    for (let step = 0; step < MAX_STEPS && results.length < MAX_SENDS_PER_EXECUTION; step++) {
      if (currentId === null || visited.has(currentId)) break
      visited.add(currentId)

      const node = graph.nodesById.get(currentId)
      if (!node) break

      if (node.subtype === 'wait') {
        // The node an execution is `waiting` on already had its ETA baked
        // into `scheduledAt` by the engine — don't count it again. Any
        // other wait we reach is a projection.
        if (!(step === 0 && input.skipFirstWait)) {
          eta = addWait(eta, node.config, input.zone)
          certainty = 'estimated'
        }
      } else if (node.subtype === 'send_email') {
        const config = node.config as {
          emailId?: number
          subject?: string
        }
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          campaignStatus: campaign.status,
          contactId: contact.id,
          contactEmail: contact.email,
          nodeId: node.id,
          emailId: config.emailId ?? null,
          subject: config.subject ?? null,
          estimatedSendAt: eta,
          certainty,
        })
      } else if (node.type === 'condition' || CONDITION_SUBTYPES.has(node.subtype)) {
        // We follow the first outgoing edge below; the real branch is a
        // runtime decision, so everything past here is an estimate.
        certainty = 'estimated'
      }

      const outgoing: CampaignEdge[] = graph.edgesBySource.get(currentId) ?? []
      if (outgoing.length === 0) break

      const nextEdge: CampaignEdge =
        outgoing.find((e) => e.sourceHandle === null || e.sourceHandle === 'default') ?? outgoing[0]
      currentId = nextEdge.targetNodeId
    }

    return results
  }

  async #loadGraphs(versionIds: number[]): Promise<Map<number, Graph>> {
    const map = new Map<number, Graph>()
    if (versionIds.length === 0) return map

    const [nodes, edges] = await Promise.all([
      CampaignNode.query().whereIn('campaignVersionId', versionIds),
      CampaignEdge.query().whereIn('campaignVersionId', versionIds),
    ])

    for (const versionId of versionIds) {
      const versionNodes = nodes.filter((n) => n.campaignVersionId === versionId)
      const nodesById = new Map(versionNodes.map((n) => [n.id, n]))

      const edgesBySource = new Map<number, CampaignEdge[]>()
      for (const edge of edges) {
        if (edge.campaignVersionId !== versionId) continue
        const list = edgesBySource.get(edge.sourceNodeId) ?? []
        list.push(edge)
        edgesBySource.set(edge.sourceNodeId, list)
      }

      const source = versionNodes.find((n) => n.type === 'source' || n.type === 'trigger')
      map.set(versionId, { nodesById, edgesBySource, sourceNodeId: source?.id ?? null })
    }

    return map
  }
}

/**
 * Mirrors `WaitExecutor`'s computation (duration + optional `waitUntil`
 * refinement, resolved in the project's timezone) closely enough for an
 * estimate — deliberately a copy, not a shared import, so the executor
 * stays a self-contained unit.
 */
function addWait(from: DateTime, config: Record<string, unknown>, zone: string): DateTime {
  const unit = (config.durationUnit as 'minutes' | 'hours' | 'days' | undefined) ?? 'days'
  const value = Number(config.durationValue ?? 0)

  let scheduledAt = from.setZone(zone).plus({ [unit]: value })

  const waitUntil = config.waitUntil as
    { type: 'time_of_day'; time: string } | { type: 'weekday'; day: string } | undefined

  if (waitUntil?.type === 'time_of_day') {
    const [hour, minute] = waitUntil.time.split(':').map(Number)
    let target = scheduledAt.set({ hour, minute, second: 0, millisecond: 0 })
    if (target <= scheduledAt) target = target.plus({ days: 1 })
    scheduledAt = target
  } else if (waitUntil?.type === 'weekday') {
    const targetIndex = WEEKDAYS.indexOf(waitUntil.day as (typeof WEEKDAYS)[number]) + 1
    let daysToAdd = (targetIndex - scheduledAt.weekday + 7) % 7
    if (daysToAdd === 0) daysToAdd = 7
    scheduledAt = scheduledAt.plus({ days: daysToAdd })
  }

  return scheduledAt.toUTC()
}
