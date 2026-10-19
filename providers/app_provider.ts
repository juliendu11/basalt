import type { ApplicationService } from '@adonisjs/core/types'
import QueueRegistry from '#services/jobs/queue_registry'
import QueueDispatcher from '#services/jobs/queue_dispatcher'
import JobHandlerRegistry from '#services/jobs/job_handler_registry'
import ScheduledTaskRegistry from '#services/jobs/scheduled_task_registry'

/**
 * Registers the stateful services that must exist exactly once per process
 * (they hold BullMQ connections or in-memory registries). Everything else is
 * resolved on demand by the container.
 */
export default class AppProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(QueueRegistry, () => new QueueRegistry())
    this.app.container.singleton(QueueDispatcher, async (resolver) => {
      return new QueueDispatcher(await resolver.make(QueueRegistry))
    })
    this.app.container.singleton(JobHandlerRegistry, () => new JobHandlerRegistry())
    this.app.container.singleton(ScheduledTaskRegistry, () => new ScheduledTaskRegistry())
  }
}
