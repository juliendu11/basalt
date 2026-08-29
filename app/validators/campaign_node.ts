import vine from '@vinejs/vine'
import type { SchemaTypes } from '@vinejs/vine/types'
import { assertValidSegmentDefinition } from '#validators/segment'
import type { CampaignNodeType } from '#types/campaign_graph'

/**
 * Shape validation for `campaign_nodes.config`, one VineJS schema per
 * `subtype` (docs/plans/11-campaign-builder.md § Validation). Selected by a
 * discriminant (`subtypeSchema(subtype)`) rather than a single VineJS
 * discriminated union, since `type`/`subtype` come from a wider payload
 * (`BuilderNode`) validated node-by-node in `CampaignBuilderService`, not a
 * single top-level request body.
 *
 * This only validates *shape*. Whether an `emailId`/`segmentId`/`tagId`/
 * `smtpConnectorId` referenced here actually belongs to the current project
 * is a separate, async check done by the caller (`CampaignBuilderService`)
 * against the database — see docs/plans/11-campaign-builder.md § Security
 * considerations.
 */

const positiveInt = vine.number().positive().withoutDecimals()

const sourceSegmentSchema = vine.object({ segmentId: positiveInt })

const sendEmailSchema = vine.object({
  emailId: positiveInt,
  smtpConnectorId: positiveInt.optional(),
})

const waitSchema = vine.object({
  durationValue: vine.number().positive(),
  durationUnit: vine.enum(['minutes', 'hours', 'days'] as const),
  waitUntil: vine
    .object({
      type: vine.enum(['time_of_day', 'weekday'] as const),
      time: vine
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      day: vine
        .enum([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ] as const)
        .optional(),
    })
    .optional(),
})

const tagActionSchema = vine.object({ tagId: positiveInt })
const segmentMembershipActionSchema = vine.object({ segmentId: positiveInt })

const referenceNodeConditionSchema = vine.object({
  referenceNodeId: vine.string().trim().minLength(1),
})

const contactFieldConditionSchema = vine.object({
  field: vine.string().trim().minLength(1),
  operator: vine.string().trim().minLength(1),
  value: vine.any().optional(),
})

const inSegmentConditionSchema = vine.object({ segmentId: positiveInt })

/** Trigger nodes are accepted structurally but never executed (no engine exists yet). */
const triggerSchema = vine.object({}).allowUnknownProperties()

const SUBTYPE_SCHEMAS: Record<string, SchemaTypes> = {
  segment: sourceSegmentSchema,
  send_email: sendEmailSchema,
  wait: waitSchema,
  add_tag: tagActionSchema,
  remove_tag: tagActionSchema,
  add_to_segment: segmentMembershipActionSchema,
  remove_from_segment: segmentMembershipActionSchema,
  email_opened: referenceNodeConditionSchema,
  email_clicked: referenceNodeConditionSchema,
  contact_field: contactFieldConditionSchema,
  in_segment: inSegmentConditionSchema,
  trigger_email_opened: triggerSchema,
  trigger_email_clicked: triggerSchema,
  trigger_contact_created: triggerSchema,
  trigger_contact_updated: triggerSchema,
  trigger_webhook_received: triggerSchema,
}

export class CampaignNodeConfigError extends Error {}

/**
 * Validates one node's `config` against its subtype's schema, throwing
 * `CampaignNodeConfigError` (collected by the caller, not thrown
 * fail-fast across the whole graph) on the first problem found for this
 * node. `contact_field` additionally reuses `assertValidSegmentDefinition`
 * (docs/plans/06-segments.md's field/operator whitelist) so a campaign
 * condition can never accept a field/operator pair the segment builder
 * itself would reject.
 */
export async function validateNodeConfig(subtype: string, config: unknown): Promise<void> {
  const schema = SUBTYPE_SCHEMAS[subtype]
  if (!schema) {
    throw new CampaignNodeConfigError(`Unknown node subtype "${subtype}"`)
  }

  try {
    await vine.validate({ schema, data: config })
  } catch {
    throw new CampaignNodeConfigError(`Invalid config for subtype "${subtype}"`)
  }

  if (subtype === 'contact_field') {
    const leaf = config as { field: string; operator: string; value?: unknown }
    try {
      assertValidSegmentDefinition({
        field: leaf.field,
        operator: leaf.operator,
        value: leaf.value as string | number | boolean | null | undefined,
      })
    } catch (error) {
      throw new CampaignNodeConfigError(
        error instanceof Error ? error.message : 'Invalid contact_field condition'
      )
    }
  }
}

export const VALID_SUBTYPES = new Set(Object.keys(SUBTYPE_SCHEMAS))

export const SUBTYPES_BY_TYPE: Record<CampaignNodeType, string[]> = {
  source: ['segment'],
  action: ['send_email', 'wait', 'add_tag', 'remove_tag', 'add_to_segment', 'remove_from_segment'],
  condition: ['email_opened', 'email_clicked', 'contact_field', 'in_segment'],
  trigger: [
    'trigger_email_opened',
    'trigger_email_clicked',
    'trigger_contact_created',
    'trigger_contact_updated',
    'trigger_webhook_received',
  ],
}
