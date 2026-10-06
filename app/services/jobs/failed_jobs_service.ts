import queueRegistry from '#services/jobs/queue_registry'
import { queueNames, type QueueName } from '#config/queue'
import EmailDelivery from '#models/email_delivery'
import Segment from '#models/segment'
import Campaign from '#models/campaign'
import CampaignExecution from '#models/campaign_execution'
import CampaignEnrollment from '#models/campaign_enrollment'

export interface FailedJobEntry {
  id: string
  queue: QueueName
  name: string
  failedReason: string
  attemptsMade: number
  // `any`, not `Record<string, unknown>` — a nested `unknown`/`Record<...>`
  // field anywhere inside an `inertia.render()` prop object collapses that
  // whole call's argument type to `never` (see the
  // inertia_props_unknown_type_never entry in the memory system); the raw
  // BullMQ job payload is inherently untyped anyway.
  data: any
  timestamp: number
}

/** Minimal shape of a BullMQ job we read here, so we don't depend on its full type. */
interface RawFailedJob {
  id?: string | null
  name: string
  data: Record<string, unknown>
  failedReason?: string
  attemptsMade: number
  timestamp: number
}

/**
 * Thin adapter over BullMQ's native failed-job API (docs/plans/20-observability-and-audit.md
 * § Backend architecture) — no reimplementation, just a display-friendly
 * shape plus explicit Redis-unavailable error handling (the plan's own
 * Failure scenarios section: the screen must show a clear error rather
 * than an unhandled exception/broken page).
 *
 * TENANT ISOLATION (docs/security-audit-2026-10-06.md § 10): the BullMQ
 * queues are a single, instance-wide set shared by every project of every
 * organization. BullMQ's `getFailed()` therefore returns jobs across ALL
 * tenants, so `list()`/`retry()` must be scoped to the caller's project or
 * an admin of one org would see (and could re-queue) the failed jobs of
 * every other org. Each job carries ids in its payload rather than a
 * `projectId` (the public `/track/*` dispatchers are deliberately DB-free,
 * and jobs already enqueued before this fix have no such field), so the
 * owning project is resolved here from those ids, in batch, and anything
 * that doesn't resolve to the requested project is dropped. Instance-level
 * jobs with no project (`statistics.aggregate_daily`) resolve to `null` and
 * are never shown to a tenant — correct, they aren't a tenant's to see.
 *
 * Security note: verified every job payload registered across this codebase
 * (`start/jobs.ts`) — none carries a decrypted secret.
 */
export default class FailedJobsService {
  /** Failed jobs belonging to `projectId` only, newest first. */
  async list(projectId: number, queueName?: QueueName): Promise<FailedJobEntry[]> {
    const names = queueName ? [queueName] : queueNames

    try {
      const perQueue = await Promise.all(
        names.map(async (name) => {
          const queue = queueRegistry.getQueue(name)
          const jobs = (await queue.getFailed()) as RawFailedJob[]
          return jobs.map((job) => ({ name, job }))
        })
      )

      const all = perQueue.flat()
      const projectByJob = await this.#resolveProjectIds(all.map((entry) => entry.job))

      return all
        .filter((entry) => projectByJob.get(entry.job) === projectId)
        .map(({ name, job }): FailedJobEntry => this.#toEntry(name, job))
        .sort((a, b) => b.timestamp - a.timestamp)
    } catch (error) {
      throw new FailedJobsUnavailableError(error)
    }
  }

  /**
   * Re-queues a failed job, but only if it belongs to `projectId`. A job
   * owned by another tenant (or one that can't be resolved to this project)
   * is treated exactly like a missing job — `false` — so the screen never
   * reveals that a foreign job id exists, nor acts on it.
   */
  async retry(projectId: number, queueName: QueueName, jobId: string): Promise<boolean> {
    try {
      const queue = queueRegistry.getQueue(queueName)
      const job = (await queue.getJob(jobId)) as RawFailedJob | undefined
      if (!job) return false

      const projectByJob = await this.#resolveProjectIds([job])
      if (projectByJob.get(job) !== projectId) return false

      await (job as unknown as { retry: () => Promise<void> }).retry()
      return true
    } catch (error) {
      throw new FailedJobsUnavailableError(error)
    }
  }

  #toEntry(queue: QueueName, job: RawFailedJob): FailedJobEntry {
    return {
      id: job.id ?? '',
      queue,
      name: job.name,
      failedReason: job.failedReason ?? 'Unknown error',
      attemptsMade: job.attemptsMade,
      data: job.data,
      timestamp: job.timestamp,
    }
  }

  /**
   * Maps each job to the id of the project that owns it, resolving the
   * entity ids its payload carries in batched `whereIn` queries (one per
   * entity type regardless of job count), so the whole list costs a handful
   * of queries rather than one per job. Fields, by job type:
   *   tracking.process_event      → deliveryId → email_deliveries.project_id
   *   segment.recompute           → segmentId  → segments.project_id
   *   campaign.enroll_batch       → campaignId → campaigns.project_id
   *   campaign-engine.advance     → executionId → enrollment.project_id
   * An unknown shape (or statistics.aggregate_daily's empty payload) maps to
   * `null`.
   */
  async #resolveProjectIds(jobs: RawFailedJob[]): Promise<Map<RawFailedJob, number | null>> {
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isInteger(v) ? v : null

    const deliveryIds = new Set<number>()
    const segmentIds = new Set<number>()
    const campaignIds = new Set<number>()
    const executionIds = new Set<number>()

    for (const job of jobs) {
      const d = job.data ?? {}
      const deliveryId = num(d.deliveryId)
      const segmentId = num(d.segmentId)
      const campaignId = num(d.campaignId)
      const executionId = num(d.executionId)
      if (deliveryId) deliveryIds.add(deliveryId)
      if (segmentId) segmentIds.add(segmentId)
      if (campaignId) campaignIds.add(campaignId)
      if (executionId) executionIds.add(executionId)
    }

    const [deliveries, segments, campaigns, executions] = await Promise.all([
      deliveryIds.size ? EmailDelivery.query().whereIn('id', [...deliveryIds]) : [],
      segmentIds.size ? Segment.query().whereIn('id', [...segmentIds]) : [],
      campaignIds.size ? Campaign.query().whereIn('id', [...campaignIds]) : [],
      executionIds.size ? CampaignExecution.query().whereIn('id', [...executionIds]) : [],
    ])

    const deliveryProject = new Map(deliveries.map((r) => [r.id, r.projectId]))
    const segmentProject = new Map(segments.map((r) => [r.id, r.projectId]))
    const campaignProject = new Map(campaigns.map((r) => [r.id, r.projectId]))

    // executionId → enrollmentId → projectId (second batched hop).
    const enrollmentIds = [...new Set(executions.map((e) => e.campaignEnrollmentId))]
    const enrollments = enrollmentIds.length
      ? await CampaignEnrollment.query().whereIn('id', enrollmentIds)
      : []
    const enrollmentProject = new Map(enrollments.map((r) => [r.id, r.projectId]))
    const executionProject = new Map(
      executions.map((e) => [e.id, enrollmentProject.get(e.campaignEnrollmentId) ?? null])
    )

    const result = new Map<RawFailedJob, number | null>()
    for (const job of jobs) {
      const d = job.data ?? {}
      const deliveryId = num(d.deliveryId)
      const executionId = num(d.executionId)
      const segmentId = num(d.segmentId)
      const campaignId = num(d.campaignId)

      let projectId: number | null = null
      if (deliveryId) projectId = deliveryProject.get(deliveryId) ?? null
      else if (executionId) projectId = executionProject.get(executionId) ?? null
      else if (segmentId) projectId = segmentProject.get(segmentId) ?? null
      else if (campaignId) projectId = campaignProject.get(campaignId) ?? null

      result.set(job, projectId)
    }
    return result
  }
}

/** Raised when the failed-jobs screen can't reach Redis/BullMQ. */
export class FailedJobsUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Unable to retrieve failed jobs — Redis appears to be unavailable.')
    this.cause = cause
  }
}
