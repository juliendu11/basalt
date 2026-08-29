import vine from '@vinejs/vine'
import CustomFieldDefinition from '#models/custom_field_definition'

/**
 * Same rationale as the contact email/SMTP connector name uniqueness rules
 * (app/validators/contact.ts, app/validators/smtp_connector.ts): VineJS's
 * built-in `unique` rule has no notion of a project scope. The caller passes
 * `projectId` via `request.validateUsing(validator, { meta: { projectId } })`.
 */
const isUniqueKeyInProject = vine.createRule(async (value, _options, field) => {
  if (typeof value !== 'string') return

  const projectId = field.meta.projectId as number
  const exists = await CustomFieldDefinition.query()
    .where('projectId', projectId)
    .where('key', value)
    .first()

  if (exists) {
    field.report('A custom field with this key already exists', 'uniqueKeyInProject', field)
  }
})

export const createCustomFieldDefinitionValidator = vine.create({
  key: vine
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]+$/)
    .minLength(1)
    .maxLength(64)
    .use(isUniqueKeyInProject()),
  label: vine.string().trim().minLength(1).maxLength(120),
  type: vine.enum(['text', 'number', 'boolean', 'date'] as const),
})

/** `key`/`type` are immutable once created — see the model/migration for why. */
export const updateCustomFieldDefinitionValidator = vine.create({
  label: vine.string().trim().minLength(1).maxLength(120),
})
