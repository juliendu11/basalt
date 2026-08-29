import { DateTime } from 'luxon'
import type CampaignExecution from '#models/campaign_execution'
import type CampaignNode from '#models/campaign_node'
import type Contact from '#models/contact'
import CampaignVersion from '#models/campaign_version'
import Campaign from '#models/campaign'
import Project from '#models/project'
import NonRetryableError from '#exceptions/non_retryable_error'
import type { NextStep, NodeExecutor } from '#services/automation/node_executor'

interface WaitConfig {
  durationValue: number
  durationUnit: 'minutes' | 'hours' | 'days'
  waitUntil?: { type: 'time_of_day'; time: string } | { type: 'weekday'; day: string }
}

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

/**
 * Computes a future `scheduledAt` from `config.durationValue`/`durationUnit`,
 * optionally refined by `config.waitUntil` (docs/plans/12-campaign-engine.md
 * § Domain concepts) — resolved in the PROJECT's timezone via Luxon, never
 * a manual UTC-offset calculation, so daylight-saving transitions are
 * handled correctly.
 */
export default class WaitExecutor implements NodeExecutor {
  async execute(
    _execution: CampaignExecution,
    node: CampaignNode,
    _contact: Contact
  ): Promise<NextStep> {
    const config = node.config as unknown as WaitConfig
    const project = await this.#resolveProject(node)
    const zone = project.timezone

    let scheduledAt = DateTime.now()
      .setZone(zone)
      .plus({ [config.durationUnit]: config.durationValue })

    if (config.waitUntil?.type === 'time_of_day') {
      scheduledAt = resolveTimeOfDay(scheduledAt, config.waitUntil.time)
    } else if (config.waitUntil?.type === 'weekday') {
      scheduledAt = resolveWeekday(scheduledAt, config.waitUntil.day)
    }

    return { outcome: 'wait', scheduledAt: scheduledAt.toUTC() }
  }

  async #resolveProject(node: CampaignNode): Promise<Project> {
    const version = await CampaignVersion.query().where('id', node.campaignVersionId).firstOrFail()
    const campaign = await Campaign.query().where('id', version.campaignId).firstOrFail()
    const project = await Project.find(campaign.projectId)
    if (!project) {
      throw new NonRetryableError(
        `wait node's project (id ${campaign.projectId}) no longer exists.`
      )
    }
    return project
  }
}

/** Next occurrence of `HH:mm` at or after `from` — today if not yet passed, else tomorrow. */
function resolveTimeOfDay(from: DateTime, time: string): DateTime {
  const [hour, minute] = time.split(':').map(Number)
  let target = from.set({ hour, minute, second: 0, millisecond: 0 })
  if (target <= from) target = target.plus({ days: 1 })
  return target
}

/** Next occurrence of the given weekday at or after `from` (same time-of-day as `from`). */
function resolveWeekday(from: DateTime, day: string): DateTime {
  const targetIndex = WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number]) + 1 // Luxon weekday: 1=Monday
  let daysToAdd = (targetIndex - from.weekday + 7) % 7
  if (daysToAdd === 0) daysToAdd = 7 // "next Monday" always means a future occurrence, not today
  return from.plus({ days: daysToAdd })
}
