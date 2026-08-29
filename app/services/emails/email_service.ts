import type User from '#models/user'
import type Project from '#models/project'
import Email from '#models/email'
import type EmailTemplate from '#models/email_template'
import type EmailLayout from '#models/email_layout'
import EmailCreated from '#events/email_created'
import EmailUpdated from '#events/email_updated'
import EmailDeleted from '#events/email_deleted'
import EmailPublished from '#events/email_published'
import GoogleTranslateService from '#services/emails/google_translate_service'
import {
  translateHtml,
  translatePlainText,
  type BatchTranslate,
} from '#services/emails/html_translator'

export interface EmailPayload {
  name: string
  subject: string
  preheader?: string | null
  senderName: string
  senderEmail: string
  replyTo?: string | null
  htmlContent: string
  textContent?: string | null
}

export interface EmailFromTemplateOverrides {
  name: string
  senderName: string
  senderEmail: string
  replyTo?: string | null
  preheader?: string | null
}

/**
 * Backs `createFromLayout` — unlike `EmailFromTemplateOverrides`, a
 * `EmailLayout` carries no `subject`/`textContent` of its own (HTML-only
 * branding frame, docs/plans/08b-email-layouts.md § Objective), so the user
 * supplies them directly here, same as a blank creation, plus `bodyContent`
 * (slotted into the layout's `{{ email_body }}` placeholder at render time,
 * `email_layout_composer.ts`).
 */
export interface EmailFromLayoutPayload {
  name: string
  subject: string
  preheader?: string | null
  senderName: string
  senderEmail: string
  replyTo?: string | null
  bodyContent: string
  textContent?: string | null
}

export default class EmailService {
  async create(project: Project, actor: User, payload: EmailPayload): Promise<Email> {
    const email = await Email.create({
      projectId: project.id,
      emailTemplateId: null,
      emailLayoutId: null,
      name: payload.name,
      subject: payload.subject,
      preheader: payload.preheader ?? null,
      senderName: payload.senderName,
      senderEmail: payload.senderEmail,
      replyTo: payload.replyTo ?? null,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent ?? null,
      status: 'draft',
    })

    await EmailCreated.dispatch(email, actor)

    return email
  }

  /**
   * Copies `subject`/`htmlContent`/`textContent` from the template
   * (`overrides` supplies everything the template doesn't carry, like
   * `senderEmail`), then is fully independent — editing the source template
   * afterward never affects this `Email` (docs/plans/09-emails.md § Domain
   * concepts, docs/plans/08-email-templates.md § Objective).
   */
  async createFromTemplate(
    project: Project,
    template: EmailTemplate,
    actor: User,
    overrides: EmailFromTemplateOverrides
  ): Promise<Email> {
    const email = await Email.create({
      projectId: project.id,
      emailTemplateId: template.id,
      emailLayoutId: null,
      name: overrides.name,
      subject: template.subject,
      preheader: overrides.preheader ?? null,
      senderName: overrides.senderName,
      senderEmail: overrides.senderEmail,
      replyTo: overrides.replyTo ?? null,
      htmlContent: template.htmlContent,
      textContent: template.textContent,
      status: 'draft',
    })

    await EmailCreated.dispatch(email, actor)

    return email
  }

  /**
   * Links `bodyContent` to the layout and leaves `htmlContent` `null` —
   * unlike `createFromTemplate`, the HTML frame is NEVER copied: it stays
   * live, read from `layout.htmlContent` on every render
   * (`email_layout_composer.ts`), so a later branding edit on the layout
   * instantly applies to this `Email` (docs/plans/08b-email-layouts.md
   * § Domain concepts).
   */
  async createFromLayout(
    project: Project,
    layout: EmailLayout,
    actor: User,
    payload: EmailFromLayoutPayload
  ): Promise<Email> {
    const email = await Email.create({
      projectId: project.id,
      emailTemplateId: null,
      emailLayoutId: layout.id,
      name: payload.name,
      subject: payload.subject,
      preheader: payload.preheader ?? null,
      senderName: payload.senderName,
      senderEmail: payload.senderEmail,
      replyTo: payload.replyTo ?? null,
      htmlContent: null,
      bodyContent: payload.bodyContent,
      textContent: payload.textContent ?? null,
      status: 'draft',
    })

    await EmailCreated.dispatch(email, actor)

    return email
  }

  /**
   * `published` is purely informational (docs/plans/09-emails.md § Domain
   * concepts) — never a lock. An already-published `Email` stays freely
   * editable; the mechanism that actually protects live campaigns is the
   * content freeze at `campaign_version` publication
   * (decisions/ADR-004-campaign-versioning.md), not this status.
   *
   * Explicitly clears `emailLayoutId`/`bodyContent` (not just merges
   * `htmlContent`) so this doubles as "detach from a layout, back to
   * freeform HTML" when called on a previously layout-linked `Email` — the
   * frontend seeds `payload.htmlContent` with that layout's current
   * composed output first, so nothing is lost switching away
   * (`EmailsController#update`).
   */
  async update(email: Email, actor: User, payload: EmailPayload): Promise<Email> {
    email.merge({
      emailLayoutId: null,
      name: payload.name,
      subject: payload.subject,
      preheader: payload.preheader ?? null,
      senderName: payload.senderName,
      senderEmail: payload.senderEmail,
      replyTo: payload.replyTo ?? null,
      htmlContent: payload.htmlContent,
      bodyContent: null,
      textContent: payload.textContent ?? null,
    })
    await email.save()

    await EmailUpdated.dispatch(email, actor)

    return email
  }

  /**
   * Same as `update()`, for a layout-linked `Email` — see
   * `EmailFromLayoutPayload`. `layout` is a separate argument (not part of
   * the payload) so this doubles as "switch to a different layout", not
   * just edit content within the current one — every call sets
   * `emailLayoutId`/clears `htmlContent` explicitly, a no-op when `layout`
   * is unchanged.
   */
  async updateFromLayout(
    email: Email,
    layout: EmailLayout,
    actor: User,
    payload: EmailFromLayoutPayload
  ): Promise<Email> {
    email.merge({
      emailLayoutId: layout.id,
      name: payload.name,
      subject: payload.subject,
      preheader: payload.preheader ?? null,
      senderName: payload.senderName,
      senderEmail: payload.senderEmail,
      replyTo: payload.replyTo ?? null,
      htmlContent: null,
      bodyContent: payload.bodyContent,
      textContent: payload.textContent ?? null,
    })
    await email.save()

    await EmailUpdated.dispatch(email, actor)

    return email
  }

  /**
   * Allowed unconditionally: `campaign_nodes`/campaigns don't exist yet in
   * this codebase, so the "orphaned `config.emailId` in a draft" concern
   * from docs/plans/09-emails.md § Edge cases is structurally moot right
   * now — deferred to docs/plans/11-campaign-builder.md, same pattern as
   * ContactService.softDelete deferring the enrollment cascade.
   */
  async delete(email: Email, actor: User): Promise<void> {
    await email.delete()

    await EmailDeleted.dispatch(email, actor)
  }

  async duplicate(email: Email, actor: User): Promise<Email> {
    const copy = await Email.create({
      projectId: email.projectId,
      emailTemplateId: email.emailTemplateId,
      emailLayoutId: email.emailLayoutId,
      name: `${email.name} (copie)`,
      subject: email.subject,
      preheader: email.preheader,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
      htmlContent: email.htmlContent,
      bodyContent: email.bodyContent,
      textContent: email.textContent,
      status: 'draft',
    })

    await EmailCreated.dispatch(copy, actor)

    return copy
  }

  /**
   * Copies `email` into a new, fully independent draft with its subject,
   * preheader, HTML body, and plain-text body machine-translated into
   * `targetLanguage` via the Google Translate API — same "clone" semantics
   * as `duplicate()`, plus translation. Only visible copy is translated:
   * `html_translator.ts` leaves tags, attributes, and `{{ variable }}`
   * tokens untouched (docs/plans/09-emails.md § Clone in another language).
   *
   * For a layout-linked `Email`, only `bodyContent` is translated — the
   * frame stays owned live by the `EmailLayout` (`email_layout_composer.ts`)
   * and is never copied here, same as `createFromLayout()`.
   */
  async translate(email: Email, actor: User, targetLanguage: string): Promise<Email> {
    const translateService = new GoogleTranslateService()
    const translate: BatchTranslate = (texts) => translateService.translate(texts, targetLanguage)

    const isLayoutLinked = email.emailLayoutId !== null

    const [subject, preheader, body, textContent] = await Promise.all([
      translatePlainText(email.subject, translate),
      email.preheader ? translatePlainText(email.preheader, translate) : Promise.resolve(null),
      isLayoutLinked
        ? translateHtml(email.bodyContent ?? '', translate)
        : translateHtml(email.htmlContent ?? '', translate),
      email.textContent ? translatePlainText(email.textContent, translate) : Promise.resolve(null),
    ])

    const copy = await Email.create({
      projectId: email.projectId,
      emailTemplateId: email.emailTemplateId,
      emailLayoutId: email.emailLayoutId,
      name: `${email.name} (${targetLanguage.toUpperCase()})`,
      subject,
      preheader,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      replyTo: email.replyTo,
      htmlContent: isLayoutLinked ? null : body,
      bodyContent: isLayoutLinked ? body : null,
      textContent,
      status: 'draft',
    })

    await EmailCreated.dispatch(copy, actor)

    return copy
  }

  async publish(email: Email, actor: User): Promise<Email> {
    email.status = 'published'
    await email.save()

    await EmailPublished.dispatch(email, actor)

    return email
  }

  async unpublish(email: Email, actor: User): Promise<Email> {
    email.status = 'draft'
    await email.save()

    await EmailUpdated.dispatch(email, actor)

    return email
  }
}
