import { DateTime } from 'luxon'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import scheduledTaskRegistry from '#services/jobs/scheduled_task_registry'

const TICK_INTERVAL_MS = 15_000

/**
 * Long-lived process driving every periodic task registered in
 * start/scheduler.ts (docs/plans/14-jobs-and-queues.md § Scheduling
 * périodique). An operator who prefers a system cron calling individual
 * ace commands per task instead of this loop may do so — both consume
 * the same underlying commands, this is a portable default, not the only
 * supported option.
 */
export default class Run extends BaseCommand {
  static commandName = 'scheduler:run'
  static description = 'Run the periodic task scheduler loop'

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  #stopped = false
  #resolveWait?: () => void

  async run() {
    const taskCount = scheduledTaskRegistry.list().length
    this.logger.info(`Scheduler started (${taskCount} task(s) registered)`)

    this.app.terminating(async () => {
      this.logger.info('Shutting down scheduler...')
      this.#stopped = true
      this.#resolveWait?.()
    })

    while (!this.#stopped) {
      await this.#tick()
      await this.#wait(TICK_INTERVAL_MS)
    }
  }

  async #tick() {
    const now = DateTime.utc()

    for (const task of scheduledTaskRegistry.list()) {
      if (!scheduledTaskRegistry.isDue(task, now)) continue

      scheduledTaskRegistry.markRan(task, now)
      this.logger.info(`Running scheduled task "${task.name}"`)

      try {
        await task.run()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(`Scheduled task "${task.name}" failed: ${message}`)
      }
    }
  }

  #wait(ms: number) {
    return new Promise<void>((resolve) => {
      this.#resolveWait = resolve
      setTimeout(resolve, ms)
    })
  }
}
