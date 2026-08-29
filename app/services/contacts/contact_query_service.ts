import type Project from '#models/project'
import Contact, { type ContactStatus } from '#models/contact'
import type { ModelPaginatorContract } from '@adonisjs/lucid/types/model'

export interface ContactFilters {
  search?: string
  status?: ContactStatus
  tagId?: number
  tag?: string
  segmentId?: number
  page?: number
  perPage?: number
}

const DEFAULT_PER_PAGE = 25

export default class ContactQueryService {
  /**
   * All filters are ANDed together (docs/plans/05-contacts.md § Edge cases
   * — no complex query builder on this list, that's what segments are for).
   */
  async paginate(
    project: Project,
    filters: ContactFilters
  ): Promise<ModelPaginatorContract<Contact>> {
    const query = Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .preload('tags')
      .orderBy('createdAt', 'desc')

    if (filters.search) {
      // Plain `where(column, 'like', term)` rather than `whereLike` — the
      // latter forces a `COLLATE utf8_bin` clause that MySQL/MariaDB
      // rejects against `utf8mb4` columns (ER_COLLATION_CHARSET_MISMATCH).
      const term = `%${filters.search}%`
      query.where((builder) => {
        builder
          .where('email', 'like', term)
          .orWhere('firstName', 'like', term)
          .orWhere('lastName', 'like', term)
      })
    }

    if (filters.status) {
      query.where('status', filters.status)
    }

    if (filters.tagId) {
      const tagId = filters.tagId
      query.whereHas('tags', (tagsQuery) => {
        tagsQuery.where('tags.id', tagId)
      })
    }

    if (filters.tag) {
      const tag = filters.tag
      query.whereHas('tags', (tagsQuery) => {
        tagsQuery.where('tags.name', tag)
      })
    }

    if (filters.segmentId) {
      const segmentId = filters.segmentId
      query.whereExists((subquery) => {
        subquery
          .from('segment_contacts')
          .whereRaw('segment_contacts.contact_id = contacts.id')
          .where('segment_contacts.segment_id', segmentId)
      })
    }

    return query.paginate(filters.page ?? 1, filters.perPage ?? DEFAULT_PER_PAGE)
  }
}
