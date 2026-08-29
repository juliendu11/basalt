import type Project from '#models/project'
import Segment from '#models/segment'
import queueDispatcher from '#services/jobs/queue_dispatcher'
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

export default class SegmentService {
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

    await queueDispatcher.dispatch('segments', 'segment.recompute', {
      segmentId: target.id,
      mode: 'full',
    })

    return target
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
