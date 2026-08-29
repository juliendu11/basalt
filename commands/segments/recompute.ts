import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import Segment from '#models/segment'
import queueDispatcher from '#services/jobs/queue_dispatcher'
import queueRegistry from '#services/jobs/queue_registry'

/**
 * Enqueues a full recompute for one segment (`--segment`), every segment of
 * one project (`--project`), or every segment of every project (no flag) —
 * used by the nightly scheduled sweep (start/scheduler.ts) and available as
 * a manual escape hatch (docs/plans/06-segments.md § Jobs / Commands).
 *
 * Examples:
 *   node ace segments:recompute --segment=42
 *   node ace segments:recompute --project=7
 *   node ace segments:recompute
 */
export default class Recompute extends BaseCommand {
  static commandName = 'segments:recompute'
  static description = 'Enqueue a full recompute for one segment, one project, or every segment'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'Recompute only this segment id' })
  declare segment?: string

  @flags.string({ description: 'Recompute every segment of this project id' })
  declare project?: string

  async run() {
    const segments = await this.#resolveSegments()

    for (const segment of segments) {
      await queueDispatcher.dispatch('segments', 'segment.recompute', {
        segmentId: segment.id,
        mode: 'full',
      })
    }

    this.logger.info(`Enqueued a full recompute for ${segments.length} segment(s)`)

    // Without this, the BullMQ producer connection(s) opened by
    // queueDispatcher keep the process alive after `run()` resolves (same
    // issue tests hit — see tests/bootstrap.ts teardown).
    await queueRegistry.closeAll()
  }

  async #resolveSegments(): Promise<Segment[]> {
    if (this.segment) {
      const segment = await Segment.find(Number(this.segment))
      return segment ? [segment] : []
    }

    if (this.project) {
      return Segment.query().where('projectId', Number(this.project))
    }

    return Segment.all()
  }
}
