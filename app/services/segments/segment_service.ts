import { inject } from '@adonisjs/core'
import type Project from '#models/project'
import Segment from '#models/segment'
import { DateTime } from 'luxon'
import SegmentContact from '#models/segment_contact'
import SegmentMembershipAdded from '#events/segment_membership_added'
import SegmentMembershipRemoved from '#events/segment_membership_removed'
import QueueDispatcher from '#services/jobs/queue_dispatcher'
import {
  isConditionGroup,
  type SegmentDefinition,
  type SegmentNode,
} from '#types/segment_definition'

export interface SegmentPayload {
  name: string
  description?: string | null
  definition: SegmentDefinition
}

@inject()
export default class SegmentService {
  constructor(protected queueDispatcher: QueueDispatcher) {}

  /**
   * Creates or updates a segment (pass an existing `segment` to update it in
   * place) and always dispatches an asynchronous full recompute afterward —
   * never recomputes synchronously in the request
   * (docs/plans/06-segments.md § User flows, ADR-003).
   */
  async save(project: Project, payload: SegmentPayload, segment?: Segment): Promise<Segment> {
    const target = segment ?? new Segment()

    target.merge({
      projectId: project.id,
      name: payload.name,
      description: payload.description ?? null,
      definition: payload.definition,
      referencedFields: extractReferencedFields(payload.definition),
      lastComputationStatus: 'running',
    })
    await target.save()

    await this.queueDispatcher.dispatch('segments', 'segment.recompute', {
      segmentId: target.id,
      mode: 'full',
    })

    return target
  }

  /**
   * Manually removes a contact from the segment without deleting its
   * `segment_contacts` row: the row is flagged `excluded_at` so the contact
   * is shown greyed out, ignored by campaigns, and never re-added by a
   * recompute. Idempotent. Returns false if the contact isn't in the segment.
   */
  async excludeContact(segment: Segment, contactId: number): Promise<boolean> {
    const row = await SegmentContact.query()
      .where('segmentId', segment.id)
      .where('contactId', contactId)
      .first()
    if (!row) return false
    if (row.excludedAt) return true

    row.excludedAt = DateTime.now()
    await row.save()

    segment.contactCountCache = Math.max(0, segment.contactCountCache - 1)
    await segment.save()

    await SegmentMembershipRemoved.dispatch(segment.id, [contactId])
    return true
  }

  /** Undoes `excludeContact`. Idempotent. Returns false if the contact isn't in the segment. */
  async restoreContact(segment: Segment, contactId: number): Promise<boolean> {
    const row = await SegmentContact.query()
      .where('segmentId', segment.id)
      .where('contactId', contactId)
      .first()
    if (!row) return false
    if (!row.excludedAt) return true

    row.excludedAt = null
    await row.save()

    segment.contactCountCache += 1
    await segment.save()

    await SegmentMembershipAdded.dispatch(segment.id, [contactId])
    return true
  }

  /**
   * No campaigns/campaign_nodes exist yet in this codebase, so the
   * "refuse deletion while an active published campaign sources from this
   * segment" rule (docs/plans/06-segments.md § Services) can't be
   * implemented yet — deferred until docs/plans/10-campaign-model.md and
   * later, same pattern as every prior phase's campaign-dependent
   * deferrals (e.g. ContactService.softDelete, SmtpConnectorService.delete).
   */
  async delete(segment: Segment): Promise<void> {
    await segment.delete()
  }
}

/**
 * Flat, deduplicated list of every leaf `field` referenced anywhere in the
 * tree — persisted on `segments.referenced_fields` and used by
 * `RecomputeSegmentsOnContactChange` to decide which segments are affected
 * by a given contact field change (docs/plans/06-segments.md § Domain
 * concepts). Exported standalone so it's unit-testable in isolation.
 */
export function extractReferencedFields(definition: SegmentDefinition): string[] {
  const fields = new Set<string>()

  const walk = (node: SegmentDefinition | SegmentNode): void => {
    if (isConditionGroup(node)) {
      for (const child of node.conditions) walk(child)
    } else {
      fields.add(node.field)
    }
  }

  walk(definition)
  return [...fields]
}
