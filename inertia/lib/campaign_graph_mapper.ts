import { MarkerType, Position, type Edge, type Node } from '@vue-flow/core'

/**
 * Translates between the persistence format (`BuilderNode`/`BuilderEdge`,
 * `clientKey`-keyed — mirrors `app/types/campaign_graph.ts`) and Vue Flow's
 * own element format (docs/plans/11-campaign-builder.md § Représentation
 * des nodes/edges) — isolated here so a future canvas-library swap only
 * touches this file.
 */

export interface BuilderNode {
  clientKey: string
  type: 'source' | 'action' | 'condition' | 'trigger'
  subtype: string

  config: any
  position: { x: number; y: number }
}

export interface BuilderEdge {
  sourceClientKey: string
  targetClientKey: string
  sourceHandle: 'true' | 'false' | null
}

/**
 * Concrete `data` shape for our nodes, used to instantiate Vue Flow's
 * generic `Node<Data>`/`Edge<Data>` types explicitly — the bare (default
 * generic) `Node`/`Edge` types caused `TS2589: Type instantiation is
 * excessively deep` once combined with array methods like `.find()` in
 * `builder.vue`.
 */
export interface GraphNodeData {
  type: string
  subtype: string

  config: any
}

export type GraphNode = Node<GraphNodeData>
export type GraphEdge = Edge

export function toVueFlowElements(
  nodes: BuilderNode[],
  edges: BuilderEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.clientKey,
      type: 'campaignNode',
      position: node.position,
      data: { type: node.type, subtype: node.subtype, config: node.config },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    })),
    edges: edges.map((edge) => ({
      id: `${edge.sourceClientKey}-${edge.sourceHandle ?? 'default'}-${edge.targetClientKey}`,
      source: edge.sourceClientKey,
      target: edge.targetClientKey,
      sourceHandle: edge.sourceHandle ?? undefined,
      label: edge.sourceHandle ?? undefined,
      markerEnd: MarkerType.ArrowClosed,
    })),
  }
}

export function fromVueFlowElements(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      clientKey: node.id,
      type: node.data!.type as BuilderNode['type'],
      subtype: node.data!.subtype,
      config: node.data!.config,
      position: { x: node.position.x, y: node.position.y },
    })),
    edges: edges.map((edge) => ({
      sourceClientKey: edge.source,
      targetClientKey: edge.target,
      sourceHandle: (edge.sourceHandle as 'true' | 'false' | null | undefined) ?? null,
    })),
  }
}
