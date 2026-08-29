import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import queueRegistry from '#services/jobs/queue_registry'

/**
 * Manual catch-up for a failed/missed nightly aggregation
 * (docs/plans/18-statistics-dashboard.md § Jobs / Commands).
 *
 * Examples:
 *   node ace statistics:aggregate                  # yesterday (default)
 *   node ace statistics:aggregate --date=2025-01-01
 */
export default class Aggregate extends BaseCommand {
  static commandName = 'statistics:aggregate'
  static description =
    'Enqueue a daily statistics aggregation for a given date (default: yesterday)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'ISO date (YYYY-MM-DD) to aggregate; default: yesterday' })
  declare date?: string

  async run() {
    await queueDispatcher.dispatch('statistics', 'statistics.aggregate_daily', {
      date: this.date,
    })

    this.logger.info(`Enqueued statistics aggregation for ${this.date ?? 'yesterday'}`)

    // Same reason as segments:recompute — without this, the BullMQ
    // producer connection keeps the process alive after `run()` resolves.
    await queueRegistry.closeAll()
  }
}
