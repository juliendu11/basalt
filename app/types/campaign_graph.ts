/**
 * Shared shapes for the campaign graph (docs/plans/11-campaign-builder.md §
 * Domain concepts, § Représentation des nodes/edges) — used by the graph
 * validator, builder service, transformer, and the payload accepted from
 * the frontend canvas. `campaign_nodes`/`campaign_edges` are the persisted,
 * `id`-keyed relational rows (decisions/ADR-001-campaign-graph-storage.md);
 * `BuilderNode`/`BuilderEdge` are the `clientKey`-keyed shape the canvas
 * actually works with.
 */

export type CampaignNodeType = 'source' | 'action' | 'condition' | 'trigger'

export type CampaignNodeSubtype =
  | 'segment'
  | 'send_email'
  | 'wait'
  | 'add_tag'
  | 'remove_tag'
  | 'add_to_segment'
  | 'remove_from_segment'
  | 'email_opened'
  | 'email_clicked'
  | 'contact_field'
  | 'in_segment'
  | 'trigger_email_opened'
  | 'trigger_email_clicked'
  | 'trigger_contact_created'
  | 'trigger_contact_updated'
  | 'trigger_webhook_received'

export interface BuilderNode {
  clientKey: string
  type: CampaignNodeType
  subtype: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

export interface BuilderEdge {
  sourceClientKey: string
  targetClientKey: string
  sourceHandle: 'true' | 'false' | null
}

export interface BuilderGraph {
  nodes: BuilderNode[]
  edges: BuilderEdge[]
}

/** One entry per node/edge-level structural problem found by the validator. */
export interface GraphValidationError {
  message: string
  nodeClientKey?: string
  edge?: { sourceClientKey: string; targetClientKey: string }
}
