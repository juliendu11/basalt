import vine from '@vinejs/vine'
import Contact from '#models/contact'

/**
 * VineJS's built-in `unique` rule has no notion of a project scope, so
 * uniqueness is checked directly against `contacts` here
 * (docs/plans/05-contacts.md § Validation). The caller passes `projectId`
 * (and, when updating, `contactId` to exclude the contact being edited) via
 * `request.validateUsing(validator, { meta: { projectId, contactId } })`.
 */
const isUniqueEmailInProject = vine.createRule(async (value, _options, field) => {
  if (typeof value !== 'string') return

  const projectId = field.meta.projectId as number
  const query = Contact.query()
    .where('projectId', projectId)
    .where('email', value)
    .whereNull('deletedAt')

  const contactId = field.meta.contactId as number | undefined
  if (contactId) {
    query.whereNot('id', contactId)
  }

  if (await query.first()) {
    field.report('A contact with this email already exists', 'uniqueEmailInProject', field)
  }
})

/**
 * Custom fields are a free-form JSON bag, but kept flat (depth 1) so segment
 * filters stay simple (docs/plans/05-contacts.md § Domain concepts) — every
 * value must be a string, number, boolean or null.
 */
const isFlatScalarRecord = vine.createRule((value, _options, field) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null && !['string', 'number', 'boolean'].includes(typeof entry)) {
      field.report(
        `The {{ field }}.${key} field must be a string, number, boolean or null`,
        'flatScalarRecord',
        field
      )
    }
  }
})

const email = () => vine.string().trim().maxLength(254).email().use(isUniqueEmailInProject())
const optionalText = () => vine.string().trim().maxLength(255).optional()
const customFields = () => vine.record(vine.any()).use(isFlatScalarRecord()).optional()

export const createContactValidator = vine.create({
  email: email(),
  firstName: optionalText(),
  lastName: optionalText(),
  phone: optionalText(),
  company: optionalText(),
  country: optionalText(),
  city: optionalText(),
  language: vine.string().trim().fixedLength(2).optional(),
  timezone: optionalText(),
  customFields: customFields(),
})

export const updateContactValidator = vine.create({
  email: email(),
  firstName: optionalText(),
  lastName: optionalText(),
  phone: optionalText(),
  company: optionalText(),
  country: optionalText(),
  city: optionalText(),
  language: vine.string().trim().fixedLength(2).optional(),
  timezone: optionalText(),
  customFields: customFields(),
})
