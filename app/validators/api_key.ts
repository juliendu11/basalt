import vine from '@vinejs/vine'

export const createApiKeyValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
})
