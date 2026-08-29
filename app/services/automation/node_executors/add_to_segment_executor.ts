import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/**
 * Direct `segment_contacts` insert, bypassing the normal segment recompute
 * machinery entirely (docs/plans/11-campaign-builder.md § Domain concepts:
 * "ajout direct à segment_contacts, hors recalcul normal") — a campaign
 * action adds a contact to a segment regardless of whether the segment's
 * own `definition` would currently match them. `INSERT IGNORE` (same
 * pattern as `SegmentRecomputeService`) makes this naturally idempotent.
 */
export default class AddToSegmentExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    const { segmentId } = node.config as unknown as { segmentId: number }

    await db.rawQuery(
      'INSERT IGNORE INTO segment_contacts (segment_id, contact_id, added_at) VALUES (?, ?, ?)',
      [segmentId, contact.id, DateTime.now().toSQL({ includeOffset: false })]
    )

    return { outcome: 'continue' }
  }
}
