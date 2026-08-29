import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/** Naturally idempotent (`.detach()` on an already-absent pivot row is a no-op). */
export default class RemoveTagExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    const { tagId } = node.config as unknown as { tagId: number }
    await contact.related('tags').detach([tagId])
    return { outcome: 'continue' }
  }
}
