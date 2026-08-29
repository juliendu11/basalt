import CampaignExecution from '#models/campaign_execution'

const DEFAULT_LIMIT = 500

/**
 * Finds `campaign_executions` ready for the engine to advance
 * (docs/plans/12-campaign-engine.md § Services) — batched, never an
 * unbounded read, so a large simultaneous due-set (e.g. many contacts on
 * the same daily `waitUntil` time) doesn't get loaded in one shot.
 */
export default class ExecutionSchedulerService {
  async findDueExecutions(limit = DEFAULT_LIMIT): Promise<CampaignExecution[]> {
    return CampaignExecution.query()
      .withScopes((scopes) => scopes.due())
      .limit(limit)
  }
}
