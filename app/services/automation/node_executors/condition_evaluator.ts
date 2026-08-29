import db from '@adonisjs/lucid/services/db'
import Contact from '#models/contact'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import { toQuery } from '#services/segments/segment_evaluator'
import type { SegmentOperator } from '#types/segment_definition'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

/**
 * Handles every `condition` subtype (docs/plans/12-campaign-engine.md §
 * Functional requirements) — always returns `{ outcome: 'branch', handle }`,
 * never `continue`/`wait`/`end` (a condition node structurally always has
 * exactly two outgoing edges, enforced by `CampaignGraphValidator` at
 * publish time).
 */
export default class ConditionEvaluator implements NodeExecutor {
  async execute(
    execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<NextStep> {
    const matched = await this.#evaluate(execution, node, contact)
    return { outcome: 'branch', handle: matched ? 'true' : 'false' }
  }

  async #evaluate(
    execution: CampaignExecution,
    node: CampaignNode,
    contact: Contact
  ): Promise<boolean> {
    switch (node.subtype) {
      case 'contact_field':
        return this.#evaluateContactField(node, contact)
      case 'in_segment':
        return this.#evaluateInSegment(node, contact)
      case 'email_opened':
        return this.#evaluateEmailEngagement(execution, node, 'opened')
      case 'email_clicked':
        return this.#evaluateEmailEngagement(execution, node, 'clicked')
      default:
        return false
    }
  }

  /**
   * `referenceNodeId` (docs/plans/11-campaign-builder.md § Domain concepts,
   * `app/validators/campaign_node.ts`) is the referenced `send_email`
   * node's `client_key` — a canvas-stable string identifier, NOT its DB
   * `id` — since that's the identifier the builder/validator work with
   * (`campaign_graph_validator.ts` resolves it the same way). `send_email_executor.ts`
   * builds its `email_deliveries.idempotency_key` from the node's numeric
   * `id`, so the `client_key` must be resolved to that `id` first, scoped
   * to the SAME `campaign_version_id` as the current node (never trusting
   * an unscoped node lookup) before the deterministic
   * `${execution.id}:${node.id}` key can be reconstructed. No delivery
   * (email never actually sent for this contact, e.g. skipped as
   * unsubscribed) or no matching `email_events` row means `false`, not an
   * error — a condition on an email that was never sent is simply unmet.
   */
  async #evaluateEmailEngagement(
    execution: CampaignExecution,
    node: CampaignNode,
    type: 'opened' | 'clicked'
  ): Promise<boolean> {
    const { referenceNodeId } = node.config as unknown as { referenceNodeId: string }

    const referencedNode = await db
      .from('campaign_nodes')
      .where('campaign_version_id', node.campaignVersionId)
      .where('client_key', referenceNodeId)
      .first()
    if (!referencedNode) return false

    const idempotencyKey = `${execution.id}:${referencedNode.id}`

    const delivery = await db
      .from('email_deliveries')
      .where('idempotency_key', idempotencyKey)
      .first()
    if (!delivery) return false

    const event = await db
      .from('email_events')
      .where('email_delivery_id', delivery.id)
      .where('type', type)
      .first()

    // The raw query builder's `.first()` (unlike a Lucid model's) resolves
    // to `null`, not `undefined`, when nothing matches — `!== undefined`
    // here would be a bug (always true). See `#evaluateInSegment` below for
    // the same fix, and the note in memory this was caught by.
    return event !== null
  }

  /**
   * Reuses `SegmentEvaluator.toQuery` (the same parameterized, injection-safe
   * field/operator translation used by segments) against a single contact,
   * rather than re-implementing the field/operator logic — per
   * docs/plans/11-campaign-builder.md's own note that `contact_field`
   * "mêmes opérateurs que 06-segments.md".
   */
  async #evaluateContactField(node: CampaignNode, contact: Contact): Promise<boolean> {
    const { field, operator, value } = node.config as unknown as {
      field: string
      operator: SegmentOperator
      value?: string | number | boolean | (string | number)[] | null
    }

    const query = Contact.query().where('id', contact.id)
    toQuery({ combinator: 'AND', conditions: [{ field, operator, value }] }, query)

    return (await query.first()) !== null
  }

  async #evaluateInSegment(node: CampaignNode, contact: Contact): Promise<boolean> {
    const { segmentId } = node.config as unknown as { segmentId: number }

    const membership = await db
      .from('segment_contacts')
      .where('segment_id', segmentId)
      .where('contact_id', contact.id)
      .first()

    // Real bug fixed while implementing Phase 12 (docs/plans/16-email-tracking.md):
    // the raw query builder's `.first()` resolves to `null`, not
    // `undefined`, when nothing matches — `!== undefined` was always true,
    // so `in_segment` conditions always branched 'true' regardless of
    // actual membership. Caught via the analogous `email_opened`/
    // `email_clicked` evaluator added just below, same mistake, same file.
    return membership !== null
  }
}
