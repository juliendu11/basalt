import { Queue } from 'bullmq'
import { queueConnection, queueDefaults, type QueueName } from '#config/queue'

/**
 * Owns the BullMQ `Queue` producer instances (one per queue name, lazily
 * created and cached) and the per-queue defaults (concurrency, attempts,
 * backoff). This is the only place in the codebase that talks to BullMQ's
 * `Queue` class directly — everything else goes through QueueDispatcher.
 *
 * See docs/plans/14-jobs-and-queues.md.
 */
class QueueRegistry {
  #queues = new Map<QueueName, Queue>()

  getQueue(name: QueueName): Queue {
    let queue = this.#queues.get(name)

    if (!queue) {
      queue = new Queue(name, { connection: queueConnection })
      this.#queues.set(name, queue)
    }

    return queue
  }

  defaultsFor(name: QueueName) {
    return queueDefaults[name]
  }

  /**
   * Explicit-step backoff (docs/plans/15-retry-and-idempotency.md) rather
   * than a generic exponential curve: registered as the Worker's
   * `backoffStrategy` for jobs dispatched with `backoff: { type: 'custom' }`.
   */
  backoffStrategyFor(name: QueueName) {
    const { backoffMs } = this.defaultsFor(name)

    return (attemptsMade: number) => backoffMs[attemptsMade - 1] ?? backoffMs[backoffMs.length - 1]
  }

  async closeAll() {
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()))
  }
}

export default new QueueRegistry()
