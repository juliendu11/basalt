import db from '@adonisjs/lucid/services/db'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/** Direct `segment_contacts` delete — naturally idempotent (delete-if-exists). */
export default class RemoveFromSegmentExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    const { segmentId } = node.config as unknown as { segmentId: number }

    await db
      .from('segment_contacts')
      .where('segment_id', segmentId)
      .where('contact_id', contact.id)
      .delete()

    return { outcome: 'continue' }
  }
}
