import { type DateTime } from 'luxon'

export type TaskSchedule =
  | { type: 'interval'; everySeconds: number }
  | { type: 'daily'; atUtc: string } // 'HH:mm', UTC
  | { type: 'hourly'; atMinute: number }

interface ScheduledTask {
  name: string
  schedule: TaskSchedule
  run: () => Promise<void>
  lastRunAt?: DateTime
  lastRunDate?: string
  lastRunHourKey?: string
}

/**
 * Registry of periodic tasks driven by `node ace scheduler:run`
 * (docs/plans/14-jobs-and-queues.md § Scheduling périodique). Each domain
 * registers what it needs run periodically (e.g. `campaign-engine.schedule_due_executions`
 * every 60s, `segments.recompute_all` once a night) instead of the scheduler
 * command knowing about every domain.
 *
 * Due-ness is tracked in memory only — acceptable per
 * docs/plans/14-jobs-and-queues.md § Open questions: a single scheduler
 * process is an accepted SPOF, a restart only delays (never loses) work
 * because every task it triggers is itself idempotent/rattrapable.
 */
class ScheduledTaskRegistry {
  #tasks: ScheduledTask[] = []

  register(name: string, schedule: TaskSchedule, run: () => Promise<void>) {
    this.#tasks.push({ name, schedule, run })
  }

  list(): readonly ScheduledTask[] {
    return this.#tasks
  }

  isDue(task: ScheduledTask, now: DateTime): boolean {
    switch (task.schedule.type) {
      case 'interval': {
        if (!task.lastRunAt) return true
        return now.diff(task.lastRunAt, 'seconds').seconds >= task.schedule.everySeconds
      }
      case 'daily': {
        const today = now.toISODate()
        if (task.lastRunDate === today) return false

        const [hour, minute] = task.schedule.atUtc.split(':').map(Number)
        return now.hour > hour || (now.hour === hour && now.minute >= minute)
      }
      case 'hourly': {
        const currentHourKey = now.toFormat('yyyy-LL-dd-HH')
        if (task.lastRunHourKey === currentHourKey) return false
        return now.minute >= task.schedule.atMinute
      }
    }
  }

  markRan(task: ScheduledTask, now: DateTime) {
    task.lastRunAt = now
    task.lastRunDate = now.toISODate() ?? undefined
    task.lastRunHourKey = now.toFormat('yyyy-LL-dd-HH')
  }
}

export default new ScheduledTaskRegistry()
