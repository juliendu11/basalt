import vine from '@vinejs/vine'

const HTML_CONTENT_MAX_LENGTH = 500_000

const name = () => vine.string().trim().maxLength(120)
const subject = () => vine.string().trim().maxLength(255)
const preheader = () => vine.string().trim().maxLength(150).optional()
const senderName = () => vine.string().trim().maxLength(255)
const senderEmail = () => vine.string().trim().maxLength(254).email()
const replyTo = () => vine.string().trim().maxLength(254).email().optional()
const htmlContent = () => vine.string().maxLength(HTML_CONTENT_MAX_LENGTH)
const bodyContent = () => vine.string().maxLength(HTML_CONTENT_MAX_LENGTH)
const textContent = () => vine.string().optional()

export const createEmailValidator = vine.create({
  name: name(),
  subject: subject(),
  preheader: preheader(),
  senderName: senderName(),
  senderEmail: senderEmail(),
  replyTo: replyTo(),
  htmlContent: htmlContent(),
  textContent: textContent(),
})

export const updateEmailValidator = vine.create({
  name: name(),
  subject: subject(),
  preheader: preheader(),
  senderName: senderName(),
  senderEmail: senderEmail(),
  replyTo: replyTo(),
  htmlContent: htmlContent(),
  textContent: textContent(),
})

/**
 * Backs "create from template" (docs/plans/09-emails.md § User flows):
 * `templateId` plus the same set of user-provided overrides as a blank
 * creation — the template supplies subject/htmlContent/textContent unless
 * overridden.
 */
export const createEmailFromTemplateValidator = vine.create({
  templateId: vine.number(),
  name: name(),
  senderName: senderName(),
  senderEmail: senderEmail(),
  replyTo: replyTo(),
  preheader: preheader(),
})

/**
 * Backs "create from layout" (docs/plans/08b-email-layouts.md § User flows):
 * `layoutId` plus `subject`/`bodyContent`/`textContent`, unlike the classic
 * template flow above — a layout carries no `subject`/`textContent` of its
 * own to copy, so the user supplies them directly, same as a blank email.
 */
export const createEmailFromLayoutValidator = vine.create({
  layoutId: vine.number(),
  name: name(),
  subject: subject(),
  senderName: senderName(),
  senderEmail: senderEmail(),
  replyTo: replyTo(),
  preheader: preheader(),
  bodyContent: bodyContent(),
  textContent: textContent(),
})

/**
 * Backs editing a layout-linked Email (docs/plans/08b-email-layouts.md §
 * User flows): same fields as `updateEmailValidator`, but `bodyContent`
 * (slotted into the layout's `{{ email_body }}` placeholder at render time,
 * `email_layout_composer.ts`) instead of a freeform `htmlContent` — the
 * frame itself is owned by the `EmailLayout`, never editable from here.
 * `layoutId` (unlike `createEmailFromLayoutValidator`, always required
 * there) lets an already layout-linked Email switch to a *different*
 * layout, not just edit its content within the current one.
 */
export const updateEmailFromLayoutValidator = vine.create({
  layoutId: vine.number(),
  name: name(),
  subject: subject(),
  preheader: preheader(),
  senderName: senderName(),
  senderEmail: senderEmail(),
  replyTo: replyTo(),
  bodyContent: bodyContent(),
  textContent: textContent(),
})

/** Backs "clone in another language" — a BCP 47-ish language/locale code, e.g. `en` or `pt-BR`. */
export const translateEmailValidator = vine.create({
  targetLanguage: vine
    .string()
    .trim()
    .regex(/^[a-zA-Z]{2}(-[a-zA-Z]{2,4})?$/)
    .maxLength(10),
})

/** Backs "send test email" — the arbitrary address to send a one-off test send to. */
export const sendTestEmailValidator = vine.create({
  testEmail: vine.string().trim().maxLength(254).email(),
})
