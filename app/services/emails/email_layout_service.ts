import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import type Project from '#models/project'
import EmailLayout from '#models/email_layout'
import EmailLayoutCreated from '#events/email_layout_created'
import EmailLayoutUpdated from '#events/email_layout_updated'
import EmailLayoutDeleted from '#events/email_layout_deleted'
import { composeEmailHtml, composeEmailText } from '#services/emails/email_layout_composer'

export interface EmailLayoutPayload {
  name: string
  htmlContent: string
  textContent?: string | null
}

export default class EmailLayoutService {
  async create(project: Project, actor: User, payload: EmailLayoutPayload): Promise<EmailLayout> {
    const layout = await EmailLayout.create({
      projectId: project.id,
      name: payload.name,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent ?? null,
    })

    await EmailLayoutCreated.dispatch(layout, actor)

    return layout
  }

  async update(
    layout: EmailLayout,
    actor: User,
    payload: EmailLayoutPayload
  ): Promise<EmailLayout> {
    layout.merge({
      name: payload.name,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent ?? null,
    })
    await layout.save()

    await EmailLayoutUpdated.dispatch(layout, actor)

    return layout
  }

  /**
   * Allowed even if `Email`s reference this layout — but since `htmlContent`
   * is a live link (docs/plans/08b-email-layouts.md § Objective), deleting
   * the layout out from under a linked `Email` would otherwise blank its
   * rendered HTML the instant `emails.email_layout_id` becomes `null` (FK
   * `SET NULL`). To avoid that silent content loss, every referencing
   * `Email`'s CURRENT composed HTML (layout + its own `bodyContent`) is
   * materialized into its `htmlContent` column first — same effect as if
   * the user had switched that email to "blank" a moment before the delete.
   * `textContent` gets the same treatment: it already holds just the
   * email's own text fragment while layout-linked, so it's overwritten with
   * the full composed text (layout text frame + fragment), mirroring the
   * html/body split without needing a second column.
   */
  async delete(layout: EmailLayout, actor: User): Promise<void> {
    await layout.load('emails')

    await db.transaction(async (trx) => {
      for (const email of layout.emails) {
        email.useTransaction(trx)
        email.htmlContent = composeEmailHtml(email, layout)
        email.bodyContent = null
        email.textContent = composeEmailText(email, layout)
        await email.save()
      }

      layout.useTransaction(trx)
      await layout.delete()
    })

    await EmailLayoutDeleted.dispatch(layout, actor)
  }

  /**
   * Copies content into a brand new row — fully independent afterward,
   * editing the original never affects the duplicate.
   */
  async duplicate(layout: EmailLayout, actor: User): Promise<EmailLayout> {
    const copy = await EmailLayout.create({
      projectId: layout.projectId,
      name: `${layout.name} (copie)`,
      htmlContent: layout.htmlContent,
      textContent: layout.textContent,
    })

    await EmailLayoutCreated.dispatch(copy, actor)

    return copy
  }
}
