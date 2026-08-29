import type CampaignNode from '#models/campaign_node'
import type CampaignEdge from '#models/campaign_edge'

/**
 * Assembles loaded `campaign_nodes`/`campaign_edges` rows into the
 * `clientKey`-keyed `{ nodes, edges }` shape the canvas actually works with
 * (docs/plans/11-campaign-builder.md § Frontend architecture) — not a raw
 * `.pick()` of the DB rows, since the frontend never sees database `id`s
 * for graph reconciliation, only `client_key`.
 *
 * No `BuilderGraph` return-type annotation, and `config` is widened to
 * `any` here: a nested `Record<string, unknown>` (what `config` is really
 * typed as on the model) anywhere in an `inertia.render(...)` prop collapses
 * that whole call's argument type to `never` — see
 * inertia_props_unknown_type_never in the memory system. `any` is the
 * confirmed escape hatch, structurally short-circuiting that check.
 */
export default class CampaignGraphTransformer {
  static transform(nodes: CampaignNode[], edges: CampaignEdge[]) {
    const nodesById = new Map(nodes.map((n) => [n.id, n]))

    return {
      nodes: nodes.map((node) => ({
        clientKey: node.clientKey,
        type: node.type,
        subtype: node.subtype,

        config: node.config as any,
        position: { x: node.positionX, y: node.positionY },
      })),
      edges: edges
        .map((edge) => {
          const source = nodesById.get(edge.sourceNodeId)
          const target = nodesById.get(edge.targetNodeId)
          if (!source || !target) return null

          return {
            sourceClientKey: source.clientKey,
            targetClientKey: target.clientKey,
            sourceHandle: edge.sourceHandle as 'true' | 'false' | null,
          }
        })
        .filter((e) => e !== null),
    }
  }
}
