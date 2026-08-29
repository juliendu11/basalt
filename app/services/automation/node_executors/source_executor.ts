import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/**
 * A `source` node (currently only the `segment` subtype) has no runtime
 * side effect of its own — it only marks where a `campaign_execution`
 * begins traversal (enrollment already happened, deciding WHICH contacts
 * enter, before the execution exists). `advance()`'s algorithm
 * (docs/plans/12-campaign-engine.md § Backend architecture) resolves and
 * "executes" the source node on an execution's very first pass (when
 * `currentNodeId` is still null) the same way as any other node, so it
 * needs a trivial pass-through executor rather than a special case in the
 * engine itself.
 */
export default class SourceExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    _node: CampaignNode,
    _contact: Contact
  ): Promise<NextStep> {
    return { outcome: 'continue' }
  }
}
