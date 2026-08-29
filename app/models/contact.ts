import { ContactSchema } from '#database/schema'
import { belongsTo, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Project from '#models/project'
import Tag from '#models/tag'

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'

export default class Contact extends ContactSchema {
  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @manyToMany(() => Tag, {
    pivotTable: 'contact_tags',
    pivotTimestamps: { createdAt: true, updatedAt: false },
  })
  declare tags: ManyToMany<typeof Tag>

  /**
   * Usage: Contact.query().withScopes((s) => s.forProject(project))
   *
   * Excludes soft-deleted contacts by default (docs/plans/05-contacts.md §
   * Data model) — there's no query-independent global scope in Lucid, so
   * every query reaching for a project's contacts is expected to go through
   * this scope rather than filtering `projectId` directly.
   */
  static forProject = scope((query, project: { id: number }) => {
    query.where('projectId', project.id).whereNull('deletedAt')
  })

  static withStatus = scope((query, status: ContactStatus) => {
    query.where('status', status)
  })

  /** Shorthand for `status = 'subscribed'` (docs/plans/05-contacts.md § Models). */
  static eligibleForSending = scope((query) => {
    query.where('status', 'subscribed')
  })
}
