import type CampaignNode from '#models/campaign_node'
import type CampaignEdge from '#models/campaign_edge'
import type { GraphValidationError } from '#types/campaign_graph'

/**
 * Structural validation of a campaign graph, run before publish
 * (docs/plans/11-campaign-builder.md § Validation). Operates entirely on an
 * already-loaded, in-memory graph (nodes+edges) — no database queries here,
 * to keep this a pure, fast, easily unit-testable function; reference
 * existence checks (`emailId`/`segmentId`/... belonging to the project) are
 * done separately by `CampaignBuilderService` before calling this.
 *
 * Collects every error found rather than failing fast, so the UI can
 * highlight every problem node/edge at once.
 */
export function validateGraph(
  nodes: CampaignNode[],
  edges: CampaignEdge[]
): GraphValidationError[] {
  const errors: GraphValidationError[] = []
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const outgoingByNode = new Map<number, CampaignEdge[]>()
  const incomingByNode = new Map<number, CampaignEdge[]>()

  for (const edge of edges) {
    if (!outgoingByNode.has(edge.sourceNodeId)) outgoingByNode.set(edge.sourceNodeId, [])
    outgoingByNode.get(edge.sourceNodeId)!.push(edge)

    if (!incomingByNode.has(edge.targetNodeId)) incomingByNode.set(edge.targetNodeId, [])
    incomingByNode.get(edge.targetNodeId)!.push(edge)
  }

  const sourceNodes = nodes.filter((n) => n.type === 'source')
  if (sourceNodes.length === 0) {
    errors.push({ message: 'The graph must have at least one source node.' })
  } else if (sourceNodes.length > 1) {
    for (const node of sourceNodes) {
      errors.push({
        message: 'Only one source node is allowed per graph (v1 restriction).',
        nodeClientKey: node.clientKey,
      })
    }
  }

  for (const node of nodes) {
    const incoming = incomingByNode.get(node.id) ?? []
    if (node.type !== 'source' && incoming.length === 0) {
      errors.push({
        message: 'This node is unreachable (no incoming edge).',
        nodeClientKey: node.clientKey,
      })
    }

    const outgoing = outgoingByNode.get(node.id) ?? []
    if (node.type === 'condition') {
      const handles = outgoing.map((e) => e.sourceHandle)
      const hasTrue = handles.includes('true')
      const hasFalse = handles.includes('false')
      const hasDuplicate = new Set(handles).size !== handles.length

      if (outgoing.length !== 2 || !hasTrue || !hasFalse || hasDuplicate) {
        errors.push({
          message:
            'A condition node must have exactly two outgoing edges, handles "true" and "false".',
          nodeClientKey: node.clientKey,
        })
      }
    } else if (outgoing.length > 1) {
      errors.push({
        message: 'Only a condition node may have more than one outgoing edge.',
        nodeClientKey: node.clientKey,
      })
    }
  }

  const cycleNode = findCycle(nodes, outgoingByNode)
  if (cycleNode) {
    errors.push({ message: 'The graph contains a cycle.', nodeClientKey: cycleNode.clientKey })
  }

  for (const node of nodes) {
    if (node.subtype === 'email_opened' || node.subtype === 'email_clicked') {
      const referenceNodeId = node.config.referenceNodeId as string | undefined
      const referenceNode = referenceNodeId
        ? nodes.find((n) => n.clientKey === referenceNodeId)
        : undefined

      if (!referenceNode || referenceNode.subtype !== 'send_email') {
        errors.push({
          message: 'This condition must reference an earlier send_email node.',
          nodeClientKey: node.clientKey,
        })
      } else if (!isUpstream(referenceNode, node, nodesById, incomingByNode)) {
        errors.push({
          message: 'The referenced send_email node must be upstream of this condition.',
          nodeClientKey: node.clientKey,
        })
      }
    }
  }

  return errors
}

/** DFS cycle detection over the directed node graph; returns the node where a back-edge was found. */
function findCycle(
  nodes: CampaignNode[],
  outgoingByNode: Map<number, CampaignEdge[]>
): CampaignNode | null {
  const state = new Map<number, 'visiting' | 'done'>()
  const nodesById = new Map(nodes.map((n) => [n.id, n]))

  function visit(node: CampaignNode): CampaignNode | null {
    state.set(node.id, 'visiting')

    for (const edge of outgoingByNode.get(node.id) ?? []) {
      const next = nodesById.get(edge.targetNodeId)
      if (!next) continue

      const nextState = state.get(next.id)
      if (nextState === 'visiting') return next
      if (nextState === 'done') continue

      const found = visit(next)
      if (found) return found
    }

    state.set(node.id, 'done')
    return null
  }

  for (const node of nodes) {
    if (state.get(node.id) === undefined) {
      const found = visit(node)
      if (found) return found
    }
  }

  return null
}

/** Whether `candidate` is reachable by walking backwards (incoming edges) from `from`. */
function isUpstream(
  candidate: CampaignNode,
  from: CampaignNode,
  nodesById: Map<number, CampaignNode>,
  incomingByNode: Map<number, CampaignEdge[]>
): boolean {
  const visited = new Set<number>()
  const queue = [from.id]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    for (const edge of incomingByNode.get(currentId) ?? []) {
      if (edge.sourceNodeId === candidate.id) return true
      if (nodesById.has(edge.sourceNodeId)) queue.push(edge.sourceNodeId)
    }
  }

  return false
}
