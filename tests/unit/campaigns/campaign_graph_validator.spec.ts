import { test } from '@japa/runner'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import { validateGraph } from '#services/campaigns/campaign_graph_validator'

function node(
  id: number,
  clientKey: string,
  type: 'source' | 'action' | 'condition' | 'trigger',
  subtype: string,
  config: Record<string, unknown> = {}
): CampaignNode {
  const n = new CampaignNode()
  n.id = id
  n.campaignVersionId = 1
  n.clientKey = clientKey
  n.type = type
  n.subtype = subtype
  n.config = config
  n.positionX = 0
  n.positionY = 0
  return n
}

function edge(
  sourceNodeId: number,
  targetNodeId: number,
  sourceHandle: string | null = null
): CampaignEdge {
  const e = new CampaignEdge()
  e.campaignVersionId = 1
  e.sourceNodeId = sourceNodeId
  e.targetNodeId = targetNodeId
  e.sourceHandle = sourceHandle
  return e
}

test.group('CampaignGraphValidator', () => {
  test('a minimal valid graph (source -> action) has no errors', ({ assert }) => {
    const nodes = [node(1, 'src', 'source', 'segment'), node(2, 'act', 'action', 'wait')]
    const edges = [edge(1, 2)]

    assert.lengthOf(validateGraph(nodes, edges), 0)
  })

  test('requires at least one source node', ({ assert }) => {
    const nodes = [node(1, 'act', 'action', 'wait')]

    const errors = validateGraph(nodes, [])
    assert.isTrue(errors.some((e) => e.message.includes('at least one source')))
  })

  test('rejects more than one source node', ({ assert }) => {
    const nodes = [node(1, 'src1', 'source', 'segment'), node(2, 'src2', 'source', 'segment')]

    const errors = validateGraph(nodes, [])
    assert.isTrue(errors.some((e) => e.message.includes('Only one source node')))
  })

  test('rejects an orphan node with no incoming edge', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'act', 'action', 'wait'),
      node(3, 'orphan', 'action', 'wait'),
    ]
    const edges = [edge(1, 2)]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.nodeClientKey === 'orphan'))
  })

  test('rejects a condition node without exactly two "true"/"false" outgoing edges', ({
    assert,
  }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'cond', 'condition', 'contact_field'),
      node(3, 'a', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3, 'true')]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.nodeClientKey === 'cond'))
  })

  test('accepts a condition node with both "true" and "false" edges', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'cond', 'condition', 'contact_field'),
      node(3, 'a', 'action', 'wait'),
      node(4, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3, 'true'), edge(2, 4, 'false')]

    assert.lengthOf(validateGraph(nodes, edges), 0)
  })

  test('rejects a non-condition node with more than one outgoing edge', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'act', 'action', 'wait'),
      node(3, 'a', 'action', 'wait'),
      node(4, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3), edge(2, 4)]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.nodeClientKey === 'act'))
  })

  test('detects a cycle', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'a', 'action', 'wait'),
      node(3, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3), edge(3, 2)]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.message.includes('cycle')))
  })

  test('email_opened must reference an earlier send_email node', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'cond', 'condition', 'email_opened', { referenceNodeId: 'nowhere' }),
      node(3, 'a', 'action', 'wait'),
      node(4, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3, 'true'), edge(2, 4, 'false')]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.nodeClientKey === 'cond'))
  })

  test('email_opened accepts a valid upstream send_email reference', ({ assert }) => {
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'send', 'action', 'send_email', { emailId: 1 }),
      node(3, 'cond', 'condition', 'email_opened', { referenceNodeId: 'send' }),
      node(4, 'a', 'action', 'wait'),
      node(5, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3), edge(3, 4, 'true'), edge(3, 5, 'false')]

    assert.lengthOf(validateGraph(nodes, edges), 0)
  })

  test('email_opened rejects a send_email reference that is not upstream', ({ assert }) => {
    // "send" is a sibling branch of "cond", not an ancestor.
    const nodes = [
      node(1, 'src', 'source', 'segment'),
      node(2, 'cond', 'condition', 'email_opened', { referenceNodeId: 'send' }),
      node(3, 'send', 'action', 'send_email', { emailId: 1 }),
      node(4, 'b', 'action', 'wait'),
    ]
    const edges = [edge(1, 2), edge(2, 3, 'true'), edge(2, 4, 'false')]

    const errors = validateGraph(nodes, edges)
    assert.isTrue(errors.some((e) => e.nodeClientKey === 'cond'))
  })

  test('collects every error rather than failing fast', ({ assert }) => {
    // Two unrelated problems: no source node, and an orphan action node.
    const nodes = [node(1, 'a', 'action', 'wait'), node(2, 'b', 'action', 'wait')]

    const errors = validateGraph(nodes, [])
    assert.isAbove(errors.length, 1)
  })
})
