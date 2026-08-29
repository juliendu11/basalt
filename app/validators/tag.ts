import vine from '@vinejs/vine'

const name = () => vine.string().trim().minLength(1).maxLength(60)
const color = () =>
  vine
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()

/**
 * Uniqueness (`UNIQUE(project_id, name)`, docs/plans/05-contacts.md § Tags)
 * is enforced service-side, not here — the update case needs to exclude the
 * tag's own row (same pattern as `ContactService#assertEmailAvailable`),
 * which a VineJS `meta`-scoped rule can't express as cleanly.
 */
export const createTagValidator = vine.create({
  name: name(),
  color: color(),
})

export const updateTagValidator = vine.create({
  name: name(),
  color: color(),
})
