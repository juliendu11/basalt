import type Project from '#models/project'
import Tag from '#models/tag'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import { DEFAULT_TAG_COLORS } from '#services/contacts/contact_tag_service'
import { slugify } from '#utils/slugify'

export interface TagPayload {
  name: string
  color?: string
}

/**
 * Project-level tag management (list/rename/recolor/delete) — separate from
 * `ContactTagService`, which owns the "attach to a contact, creating the tag
 * on the fly if needed" flow. Both ultimately write the same `tags` table
 * (`UNIQUE(project_id, name)`), so this service applies the same
 * `#assertNameAvailable`-before-write pattern as `ContactService#update`
 * (app/services/contacts/contact_service.ts) rather than trusting the
 * unique constraint to fail nicely.
 */
export default class TagService {
  async create(project: Project, payload: TagPayload): Promise<Tag> {
    await this.#assertNameAvailable(project, payload.name)

    return Tag.create({
      projectId: project.id,
      name: payload.name,
      color:
        payload.color ??
        DEFAULT_TAG_COLORS[slugify(payload.name).length % DEFAULT_TAG_COLORS.length],
    })
  }

  async update(tag: Tag, payload: TagPayload): Promise<Tag> {
    if (payload.name !== tag.name) {
      await this.#assertNameAvailable({ id: tag.projectId }, payload.name, tag.id)
    }

    tag.merge({
      name: payload.name,
      color: payload.color ?? tag.color,
    })
    await tag.save()

    return tag
  }

  /**
   * `contact_tags.tag_id` has `ON DELETE CASCADE` (docs/plans/05-contacts.md
   * § Tags) — deleting the tag row is enough, no manual detach needed. Any
   * campaign `add_tag`/`remove_tag` node or segment condition still
   * referencing this `tagId` becomes a silent no-op rather than an error
   * (neither has a foreign key on `tags.id`) — not cleaned up here.
   */
  async delete(tag: Tag): Promise<void> {
    await tag.delete()
  }

  async #assertNameAvailable(
    project: { id: number },
    name: string,
    excludeTagId?: number
  ): Promise<void> {
    const query = Tag.query().where('projectId', project.id).where('name', name)

    if (excludeTagId) {
      query.whereNot('id', excludeTagId)
    }

    if (await query.first()) {
      throw new BusinessRuleViolation(`A tag named "${name}" already exists in this project.`)
    }
  }
}
