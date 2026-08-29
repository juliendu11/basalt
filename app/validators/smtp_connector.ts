import vine from '@vinejs/vine'
import SmtpConnector from '#models/smtp_connector'

/**
 * Same rationale as the contact email-uniqueness rule
 * (app/validators/contact.ts): VineJS's built-in `unique` rule has no
 * notion of a project scope (docs/plans/07-smtp-connectors.md § Validation).
 * The caller passes `projectId` (and, when updating, `connectorId` to
 * exclude the connector being edited) via `request.validateUsing(validator,
 * { meta: { projectId, connectorId } })`.
 */
const isUniqueNameInProject = vine.createRule(async (value, _options, field) => {
  if (typeof value !== 'string') return

  const projectId = field.meta.projectId as number
  const query = SmtpConnector.query().where('projectId', projectId).where('name', value)

  const connectorId = field.meta.connectorId as number | undefined
  if (connectorId) {
    query.whereNot('id', connectorId)
  }

  if (await query.first()) {
    field.report('A connector with this name already exists', 'uniqueNameInProject', field)
  }
})

const name = () => vine.string().trim().maxLength(120).use(isUniqueNameInProject())
const host = () => vine.string().trim().maxLength(255)
const port = () => vine.number().min(1).max(65535)
const username = () => vine.string().trim().maxLength(255)
const encryption = () => vine.enum(['none', 'ssl', 'tls'] as const)
const fromEmail = () => vine.string().trim().maxLength(254).email()
const fromName = () => vine.string().trim().maxLength(255)
const replyTo = () => vine.string().trim().maxLength(254).email().optional()
const dailyLimit = () => vine.number().positive().optional()

export const createSmtpConnectorValidator = vine.create({
  name: name(),
  host: host(),
  port: port(),
  username: username(),
  password: vine.string().minLength(1),
  encryption: encryption(),
  fromEmail: fromEmail(),
  fromName: fromName(),
  replyTo: replyTo(),
  dailyLimit: dailyLimit(),
})

/**
 * `password` is optional here: an empty/absent value on edit means "keep
 * the existing password" (docs/plans/07-smtp-connectors.md § Frontend
 * architecture) — never blanked out.
 */
export const updateSmtpConnectorValidator = vine.create({
  name: name(),
  host: host(),
  port: port(),
  username: username(),
  password: vine.string().minLength(1).optional(),
  encryption: encryption(),
  fromEmail: fromEmail(),
  fromName: fromName(),
  replyTo: replyTo(),
  dailyLimit: dailyLimit(),
})

/**
 * Backs the "test before saving" flow (docs/plans/07-smtp-connectors.md §
 * User flows) — only the fields a real SMTP connection needs, no name
 * uniqueness or from/reply-to checks since nothing is persisted.
 */
export const testSmtpConnectionValidator = vine.create({
  host: host(),
  port: port(),
  username: username(),
  password: vine.string().minLength(1),
  encryption: encryption(),
})
