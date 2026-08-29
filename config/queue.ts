import env from '#start/env'
import type { ConnectionOptions } from 'bullmq'

/**
 * Dedicated ioredis connection options for BullMQ. Kept separate from
 * @adonisjs/redis (used by the limiter) because BullMQ workers open
 * blocking connections and are expected to manage their own client
 * instances rather than share a pooled connection manager.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for blocking
 * commands (see BullMQ docs).
 */
export const queueConnection: ConnectionOptions = {
  host: env.get('REDIS_HOST'),
  port: env.get('REDIS_PORT'),
  password: env.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
}

/**
 * The queues defined by the system (docs/plans/14-jobs-and-queues.md).
 * Each domain dispatches its jobs onto one of these queues; new queues
 * should not be added ad hoc elsewhere, this is the single source of
 * truth for what queues exist.
 */
export const queueNames = [
  'emails',
  'campaign-engine',
  'segments',
  'tracking',
  'statistics',
] as const

export type QueueName = (typeof queueNames)[number]

export interface QueueDefaults {
  /** Worker concurrency for this queue (overridable per environment). */
  concurrency: number
  /** Max attempts before a job is considered permanently failed. */
  attempts: number
  /** Backoff delay (ms) applied after each failed attempt, by attempt index. */
  backoffMs: number[]
}

/**
 * Per-queue defaults (docs/plans/15-retry-and-idempotency.md). Values are
 * deliberately explicit steps rather than a generic exponential backoff:
 * they are tuned per domain (e.g. a segment recompute is expensive to
 * replay too quickly, an SMTP send should retry a transient blip fast).
 */
export const queueDefaults: Record<QueueName, QueueDefaults> = {
  'emails': {
    concurrency: env.get('QUEUE_EMAILS_CONCURRENCY') ?? 5,
    attempts: 4,
    backoffMs: [30_000, 120_000, 600_000],
  },
  'campaign-engine': {
    concurrency: env.get('QUEUE_CAMPAIGN_ENGINE_CONCURRENCY') ?? 10,
    attempts: 4,
    backoffMs: [30_000, 120_000, 600_000],
  },
  'segments': {
    concurrency: env.get('QUEUE_SEGMENTS_CONCURRENCY') ?? 2,
    attempts: 2,
    backoffMs: [300_000, 1_800_000],
  },
  'tracking': {
    concurrency: env.get('QUEUE_TRACKING_CONCURRENCY') ?? 10,
    attempts: 5,
    backoffMs: [10_000, 30_000, 60_000, 300_000, 900_000],
  },
  'statistics': {
    concurrency: env.get('QUEUE_STATISTICS_CONCURRENCY') ?? 2,
    attempts: 3,
    backoffMs: [300_000, 1_800_000, 7_200_000],
  },
}
