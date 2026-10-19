import { inject } from '@adonisjs/core'
import Segment from '#models/segment'
import QueueDispatcher from '#services/jobs/queue_dispatcher'
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
@inject()
export default class TagService {
  constructor(protected queueDispatcher: QueueDispatcher) {}

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
   * (neither has a foreign key on `tags.id`) — not cleaned up here. Segments
   * filtering on tags are recomputed, so contacts that only matched through
   * this tag leave them (which cancels their pending campaign sends).
   */
  async delete(tag: Tag): Promise<void> {
    await tag.delete()

    const segments = await Segment.query().where('projectId', tag.projectId)
    for (const segment of segments.filter((s) => s.referencedFields.includes('tags'))) {
      await this.queueDispatcher.dispatch('segments', 'segment.recompute', {
        segmentId: segment.id,
        mode: 'full',
      })
    }
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
