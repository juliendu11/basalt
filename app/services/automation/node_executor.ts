import type { DateTime } from 'luxon'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'

/**
 * Shared contract every node subtype's runtime behavior implements
 * (docs/plans/12-campaign-engine.md § Backend architecture). `execute()`
 * never mutates `execution`/decides the next node itself — it only reports
 * what happened; `CampaignEngineService.advance()` owns interpreting the
 * `NextStep` into an actual state transition (resolving the outgoing edge,
 * updating `campaign_executions`, journaling the event). This keeps every
 * executor a narrow, independently testable unit.
 */
export type NextStep = (
  | { outcome: 'continue' }
  | { outcome: 'wait'; scheduledAt: DateTime }
  | { outcome: 'branch'; handle: 'true' | 'false' }
  | { outcome: 'end' }
) & {
  /**
   * Optional human-readable note for the `campaign_execution_events` row
   * `advance()` journals for this transition (e.g. "email skipped: contact
   * not subscribed", docs/plans/12-campaign-engine.md § Edge cases) — kept
   * generic on `NextStep` rather than a `send_email`-specific field, since
   * any executor may want to annotate its transition.
   */
  note?: string
}

export interface NodeExecutor {
  execute(execution: CampaignExecution, node: CampaignNode, contact: Contact): Promise<NextStep>
}
