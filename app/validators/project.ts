import vine from '@vinejs/vine'

const IANA_TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'))

/**
 * VineJS ships no built-in IANA time zone rule, so it's validated against
 * `Intl.supportedValuesOf('timeZone')` — the runtime's own tz database
 * (docs/plans/04-projects.md § Validation).
 */
const isIanaTimeZone = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string' || !IANA_TIME_ZONES.has(value)) {
    field.report('The {{ field }} field must be a valid IANA time zone', 'ianaTimeZone', field)
  }
})

const name = () => vine.string().trim().minLength(2).maxLength(120)
const timezone = () => vine.string().trim().use(isIanaTimeZone())
const slug = () =>
  vine
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .maxLength(140)
const image = () =>
  vine.file({ size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }).optional()
const defaultSenderName = () => vine.string().trim().maxLength(255).optional()
const defaultSenderEmail = () => vine.string().trim().maxLength(254).email().optional()

export const createProjectValidator = vine.create({
  name: name(),
  timezone: timezone(),
  slug: slug().optional(),
  image: image(),
  defaultSenderName: defaultSenderName(),
  defaultSenderEmail: defaultSenderEmail(),
})

/**
 * `slug` is deliberately absent: it's immutable after creation
 * (docs/plans/04-projects.md § Edge cases).
 */
export const updateProjectValidator = vine.create({
  name: name(),
  timezone: timezone(),
  image: image(),
  removeImage: vine.boolean().optional(),
  defaultSenderName: defaultSenderName(),
  defaultSenderEmail: defaultSenderEmail(),
})
