import type User from '#models/user'
import type Project from '#models/project'
import type Contact from '#models/contact'
import Tag from '#models/tag'
import ContactUpdated from '#events/contact_updated'
import { slugify } from '#utils/slugify'

/** Also reused by `TagService#create` (app/services/tags/tag_service.ts) when a color isn't supplied. */
export const DEFAULT_TAG_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6']

/**
 * Shared by the web `ContactTagsController` and the API `ContactTagsController`
 * so tag mutations from either surface behave identically — in particular,
 * both dispatch `ContactUpdated` with `changedFields: ['tags']` so
 * `RecomputeSegmentsOnContactChange` (app/listeners/recompute_segments_on_contact_change.ts)
 * targets any segment whose definition references the `tags` field, the same
 * way a contact field edit does.
 */
export default class ContactTagService {
  /** Creates the tag on the fly if it doesn't exist yet (docs/plans/05-contacts.md § Functional requirements). */
  async attach(project: Project, contact: Contact, actor: User, name: string): Promise<Tag> {
    let tag = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('name', name)
      .first()

    if (!tag) {
      tag = await Tag.create({
        projectId: project.id,
        name,
        color: DEFAULT_TAG_COLORS[slugify(name).length % DEFAULT_TAG_COLORS.length],
      })
    }

    await contact.related('tags').sync([tag.id], false)
    await ContactUpdated.dispatch(contact, actor, ['tags'])

    return tag
  }

  async detach(contact: Contact, actor: User, tagId: number): Promise<void> {
    await contact.related('tags').detach([tagId])
    await ContactUpdated.dispatch(contact, actor, ['tags'])
  }
}
