import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/** Naturally idempotent (`.sync(ids, false)` never detaches, upserts the pivot row). */
export default class AddTagExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    const { tagId } = node.config as unknown as { tagId: number }
    await contact.related('tags').sync([tagId], false)
    return { outcome: 'continue' }
  }
}
