import vine from '@vinejs/vine'

const name = () => vine.string().trim().minLength(2).maxLength(120)
const image = () =>
  vine.file({ size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }).optional()

export const createOrganizationValidator = vine.create({
  name: name(),
  image: image(),
})

export const updateOrganizationValidator = vine.create({
  name: name(),
  image: image(),
  removeImage: vine.boolean().optional(),
})

/**
 * `owner` is deliberately excluded: ownership is transferred through a
 * dedicated action, never assigned via invitation or a plain role change
 * (docs/plans/03-organizations.md § Domain concepts).
 */
const invitableRole = () => vine.enum(['admin', 'member', 'viewer'] as const)

export const inviteMemberValidator = vine.create({
  email: vine.string().trim().email().maxLength(254),
  role: invitableRole(),
})

export const changeRoleValidator = vine.create({
  role: invitableRole(),
})
