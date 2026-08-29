import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import type { Job } from 'bullmq'
import type CampaignExecution from '#models/campaign_execution'
import CampaignEnrollment from '#models/campaign_enrollment'
import Campaign from '#models/campaign'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import CampaignExecutionEvent from '#models/campaign_execution_event'
import Contact from '#models/contact'
import ExecutionLockService from '#services/automation/execution_lock_service'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'
import SourceExecutor from '#services/automation/node_executors/source_executor'
import WaitExecutor from '#services/automation/node_executors/wait_executor'
import SendEmailExecutor from '#services/automation/node_executors/send_email_executor'
import AddTagExecutor from '#services/automation/node_executors/add_tag_executor'
import RemoveTagExecutor from '#services/automation/node_executors/remove_tag_executor'
import AddToSegmentExecutor from '#services/automation/node_executors/add_to_segment_executor'
import RemoveFromSegmentExecutor from '#services/automation/node_executors/remove_from_segment_executor'
import ConditionEvaluator from '#services/automation/node_executors/condition_evaluator'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import CampaignExecutionCompleted from '#events/campaign_execution_completed'
import CampaignExecutionCancelled from '#events/campaign_execution_cancelled'
import CampaignExecutionFailed from '#events/campaign_execution_failed'
import NonRetryableError from '#exceptions/non_retryable_error'

export interface AdvancePayload {
  executionId: number
  /**
   * Consecutive continue/branch transitions applied to this execution
   * without hitting a `wait` — carried through the re-enqueued job payload
   * rather than a persisted column (docs/plans/12-campaign-engine.md §
   * Edge cases: anti-infinite-loop guard). Resets to 0 whenever the
   * execution actually waits.
   */
  loopGuardCount?: number
}

const LOOP_GUARD_THRESHOLD = 50
const conditionEvaluator = new ConditionEvaluator()

const executorsBySubtype: Record<string, NodeExecutor> = {
  segment: new SourceExecutor(),
  wait: new WaitExecutor(),
  send_email: new SendEmailExecutor(),
  add_tag: new AddTagExecutor(),
  remove_tag: new RemoveTagExecutor(),
  add_to_segment: new AddToSegmentExecutor(),
  remove_from_segment: new RemoveFromSegmentExecutor(),
  contact_field: conditionEvaluator,
  in_segment: conditionEvaluator,
  email_opened: conditionEvaluator,
  email_clicked: conditionEvaluator,
}

/**
 * `advance()` is the sole entry point for progressing a `campaign_execution`
 * one node at a time (docs/plans/12-campaign-engine.md § Backend
 * architecture, the full 9-step algorithm). Every "continue"/"branch"
 * transition re-enqueues a NEW job rather than looping in-process — this
 * bounds how long any single worker slot can be monopolized by one contact's
 * graph, and is also what makes the anti-infinite-loop guard possible
 * (tracked per-job via `loopGuardCount`, not in-memory across an unbounded
 * synchronous loop).
 */
export default class CampaignEngineService {
  #lockService = new ExecutionLockService()

  async advance(payload: AdvancePayload, _job?: Job<AdvancePayload>): Promise<void> {
    const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`
    const loopGuardCount = payload.loopGuardCount ?? 0

    const execution = await this.#lockService.acquire(payload.executionId, workerId)
    if (!execution) return // another worker already holds a fresh lock — silent no-op

    const enrollment = await CampaignEnrollment.query()
      .where('id', execution.campaignEnrollmentId)
      .firstOrFail()

    try {
      // Defensive: a stray/duplicate BullMQ redelivery (at-least-once
      // delivery) of a job for an execution that has ALREADY reached a
      // terminal state (e.g. the legitimate advance() call that completed
      // it already ran and released the lock) must be a pure no-op — not
      // re-evaluated as if arriving fresh. Without this guard, re-entering
      // the algorithm below would re-check `enrollment.status !== 'active'`
      // (true, since #complete()/#cancel()/#fail() already flipped it to a
      // terminal state) and incorrectly flip an already-`completed`
      // enrollment to `cancelled`, corrupting good historical state.
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        await this.#lockService.release(execution.id, execution.lockVersion, {
          status: execution.status,
          currentNodeId: execution.currentNodeId,
          scheduledAt: execution.scheduledAt,
        })
        return
      }

      // Defensive: only `pending` or an ACTUALLY-due `waiting` execution
      // should ever be acted on. Normal operation never calls `advance()`
      // otherwise (the scheduler only enqueues due executions, and the
      // engine itself never re-enqueues a job for a 'wait' outcome) — but
      // BullMQ's at-least-once delivery means a stray/duplicate job could
      // theoretically still arrive early, so this is checked here too
      // rather than trusted purely from the dispatch side (same "defense
      // in depth, not just confidence in the trigger" principle
      // docs/plans/05-contacts.md applies to the soft-delete cascade).
      if (execution.status === 'waiting' && execution.scheduledAt > DateTime.now()) {
        await this.#lockService.release(execution.id, execution.lockVersion, {
          status: execution.status,
          currentNodeId: execution.currentNodeId,
          scheduledAt: execution.scheduledAt,
        })
        return
      }

      const campaign = await Campaign.query().where('id', enrollment.campaignId).firstOrFail()

      // Paused (or otherwise non-active) campaign: neither advance nor
      // modify the execution — release the lock unchanged so it stays
      // exactly as due as it was, re-evaluated by the next scheduler pass
      // (docs/plans/10-campaigns.md § Domain concepts, docs/plans/12-campaign-engine.md
      // § Edge cases).
      if (campaign.status !== 'active') {
        await this.#lockService.release(execution.id, execution.lockVersion, {
          status: execution.status,
          currentNodeId: execution.currentNodeId,
          scheduledAt: execution.scheduledAt,
        })
        return
      }

      if (enrollment.status !== 'active') {
        await this.#cancel(execution, enrollment, 'enrollment no longer active')
        return
      }

      const contact = await Contact.query().where('id', enrollment.contactId).first()
      // Defensive, in addition to the (deferred, not yet implemented)
      // enrollment-cancellation cascade on contact soft-delete
      // (docs/plans/05-contacts.md § Edge cases: "vérification
      // supplémentaire défensive dans le moteur, pas seulement une
      // confiance" in that cascade running) — the engine must never act on
      // a missing/soft-deleted contact regardless of enrollment state.
      if (!contact || contact.deletedAt) {
        await this.#cancel(execution, enrollment, 'contact no longer exists')
        return
      }

      const version = await CampaignVersion.query()
        .where('id', enrollment.campaignVersionId)
        .firstOrFail()

      const node = execution.currentNodeId
        ? await CampaignNode.query().where('id', execution.currentNodeId).firstOrFail()
        : await CampaignNode.query()
            .where('campaignVersionId', version.id)
            .where('type', 'source')
            .firstOrFail()

      // `execution.status === 'waiting'` means we're not arriving at this
      // node for the first time — we're RESUMING one whose wait period has
      // already elapsed (the scheduler only enqueues due executions, and
      // the due-check above already rejected a not-yet-due one). Calling
      // `WaitExecutor.execute()` again here would compute a brand new
      // future `scheduledAt` from "now" and leave the execution waiting
      // forever — the wait has already happened, so this pass must instead
      // move PAST the wait node, exactly as a 'continue' outcome would.
      // Only a node reached for the very first time (status 'pending')
      // actually invokes its executor.
      const result: NextStep =
        execution.status === 'waiting'
          ? { outcome: 'continue' }
          : await this.#executeNode(node, execution, contact)

      if (result.outcome === 'wait') {
        await this.#lockService.release(execution.id, execution.lockVersion, {
          status: 'waiting',
          currentNodeId: node.id,
          scheduledAt: result.scheduledAt,
          attemptCount: 0,
        })
        await this.#logEvent(execution.id, node.id, 'node_waiting', result.note)
        return
      }

      if (result.outcome === 'continue' || result.outcome === 'branch') {
        const outgoing = await CampaignEdge.query()
          .where('campaignVersionId', version.id)
          .where('sourceNodeId', node.id)

        const nextEdge =
          result.outcome === 'branch'
            ? outgoing.find((edge) => edge.sourceHandle === result.handle)
            : outgoing[0]

        if (!nextEdge) {
          await this.#complete(execution, enrollment)
          await this.#logEvent(execution.id, node.id, 'node_executed', result.note)
          return
        }

        const nextLoopGuardCount = loopGuardCount + 1
        if (nextLoopGuardCount > LOOP_GUARD_THRESHOLD) {
          await this.#fail(execution, enrollment, 'possible infinite loop detected')
          return
        }

        await this.#lockService.release(execution.id, execution.lockVersion, {
          status: 'pending',
          currentNodeId: nextEdge.targetNodeId,
          scheduledAt: DateTime.now(),
          attemptCount: 0,
        })
        await this.#logEvent(execution.id, node.id, 'node_executed', result.note)

        await queueDispatcher.dispatch('campaign-engine', 'campaign-engine.advance', {
          executionId: execution.id,
          loopGuardCount: nextLoopGuardCount,
        })
        return
      }

      // 'end'
      await this.#complete(execution, enrollment)
      await this.#logEvent(execution.id, node.id, 'node_executed', result.note)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (error instanceof NonRetryableError) {
        await this.#fail(execution, enrollment, message)
        return
      }

      // Retryable (or any untyped error — defaulting to retryable is the
      // deliberate "uncertain" bias per docs/plans/15-retry-and-idempotency.md
      // § Domain concepts): release the lock back to the SAME state (rather
      // than leaving it held until staleness) so a BullMQ retry can
      // reacquire it promptly on the queue's own backoff schedule, instead
      // of being stuck for the full staleness window
      // (docs/plans/12-campaign-engine.md § Concurrence — staleness is the
      // crash-recovery path, not the intended path for an error we already
      // know about and are actively propagating for retry).
      await this.#lockService.release(execution.id, execution.lockVersion, {
        status: execution.status,
        currentNodeId: execution.currentNodeId,
        scheduledAt: execution.scheduledAt,
        lastError: message,
        attemptCount: execution.attemptCount + 1,
      })

      throw error
    }
  }

  async #executeNode(
    node: CampaignNode,
    execution: CampaignExecution,
    contact: Contact
  ): Promise<NextStep> {
    const executor = executorsBySubtype[node.subtype]
    if (!executor) {
      // The graph was already structurally validated at publish time
      // (docs/plans/11-campaign-builder.md), so an unknown subtype here is
      // an application inconsistency, not a user error — non-retryable,
      // retrying would never resolve it (docs/plans/12-campaign-engine.md
      // § Validation).
      throw new NonRetryableError(`No executor registered for node subtype "${node.subtype}".`)
    }

    return executor.execute(execution, node, contact)
  }

  async #complete(execution: CampaignExecution, enrollment: CampaignEnrollment): Promise<void> {
    await this.#lockService.release(execution.id, execution.lockVersion, {
      status: 'completed',
      finishedAt: DateTime.now(),
    })
    enrollment.status = 'completed'
    enrollment.exitedAt = DateTime.now()
    await enrollment.save()

    await CampaignExecutionCompleted.dispatch(execution.id, enrollment.id)
  }

  async #cancel(
    execution: CampaignExecution,
    enrollment: CampaignEnrollment,
    reason: string
  ): Promise<void> {
    await this.#lockService.release(execution.id, execution.lockVersion, {
      status: 'cancelled',
      finishedAt: DateTime.now(),
    })
    if (enrollment.status === 'active') {
      enrollment.status = 'cancelled'
      enrollment.exitedAt = DateTime.now()
      enrollment.exitReason = reason.slice(0, 64)
      await enrollment.save()
    }

    await CampaignExecutionCancelled.dispatch(execution.id, enrollment.id, reason)
  }

  /** Called while still holding the original lock (loop guard trip, or a caught `NonRetryableError`). */
  async #fail(
    execution: CampaignExecution,
    enrollment: CampaignEnrollment,
    reason: string
  ): Promise<void> {
    await this.#lockService.release(execution.id, execution.lockVersion, {
      status: 'failed',
      finishedAt: DateTime.now(),
      lastError: reason,
      attemptCount: execution.attemptCount + 1,
    })

    await CampaignExecutionFailed.dispatch(execution.id, enrollment.id, reason)
  }

  async #logEvent(
    executionId: number,
    nodeId: number,
    type: string,
    message?: string
  ): Promise<void> {
    await CampaignExecutionEvent.create({
      campaignExecutionId: executionId,
      nodeId,
      type,
      message: message ?? null,
      occurredAt: DateTime.now(),
    })
  }
}

/** Registered as the `campaign-engine:campaign-engine.advance` handler (start/jobs.ts). */
export async function advanceExecutionJob(payload: AdvancePayload, job: Job<AdvancePayload>) {
  const service = new CampaignEngineService()
  await service.advance(payload, job)
}
