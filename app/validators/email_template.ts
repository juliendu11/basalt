import vine from '@vinejs/vine'

/**
 * 500KB cap on htmlContent (docs/plans/08-email-templates.md § Validation) —
 * generous enough for rich HTML emails while ruling out abuse.
 */
const HTML_CONTENT_MAX_LENGTH = 500_000

const name = () => vine.string().trim().maxLength(120)
const subject = () => vine.string().trim().maxLength(255)
const htmlContent = () => vine.string().maxLength(HTML_CONTENT_MAX_LENGTH)
const textContent = () => vine.string().optional()

export const createEmailTemplateValidator = vine.create({
  name: name(),
  subject: subject(),
  htmlContent: htmlContent(),
  textContent: textContent(),
})

export const updateEmailTemplateValidator = vine.create({
  name: name(),
  subject: subject(),
  htmlContent: htmlContent(),
  textContent: textContent(),
})
