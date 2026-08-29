/*
|--------------------------------------------------------------------------
| Job handlers registration
|--------------------------------------------------------------------------
|
| Each domain registers its BullMQ job handlers here (or via an import of
| a domain-specific registration module) against the job_handler_registry
| service. Kept as a single preloaded entry point so `node ace queue:work`
| only has to import this file to know about every job in the system. See
| docs/plans/14-jobs-and-queues.md.
|
*/

import jobHandlerRegistry from '#services/jobs/job_handler_registry'
import { recomputeSegmentJob } from '#services/segments/segment_recompute_service'
import { advanceExecutionJob } from '#services/automation/campaign_engine_service'
import { enrollBatchJob } from '#services/campaigns/campaign_enrollment_service'
import { processTrackingEventJob } from '#services/tracking/tracking_event_service'
import { aggregateDailyStatsJob } from '#services/statistics/statistics_aggregation_service'

jobHandlerRegistry.register('segments', 'segment.recompute', recomputeSegmentJob)
jobHandlerRegistry.register('campaign-engine', 'campaign-engine.advance', advanceExecutionJob)
jobHandlerRegistry.register('campaign-engine', 'campaign.enroll_batch', enrollBatchJob)
jobHandlerRegistry.register('tracking', 'tracking.process_event', processTrackingEventJob)
jobHandlerRegistry.register('statistics', 'statistics.aggregate_daily', aggregateDailyStatsJob)
