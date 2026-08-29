import { DateTime } from 'luxon'
import type { Job } from 'bullmq'
import db from '@adonisjs/lucid/services/db'
import Segment from '#models/segment'
import Contact from '#models/contact'
import SegmentContact from '#models/segment_contact'
import SegmentMembershipAdded from '#events/segment_membership_added'
import SegmentMembershipRemoved from '#events/segment_membership_removed'
import SegmentRecomputed from '#events/segment_recomputed'
import { toQuery } from '#services/segments/segment_evaluator'
import { loadCustomFieldTypes } from '#services/custom_fields/custom_field_definition_service'
import type { CustomFieldType } from '#models/custom_field_definition'

const DEFAULT_BATCH_SIZE = 5000

/**
 * Full and targeted recompute of `segment_contacts` membership
 * (docs/plans/06-segments.md § Backend architecture, ADR-003). `batchSize`
 * is a constructor parameter (not a hardcoded constant) purely so tests can
 * force multiple batches at a small, fast scale rather than needing
 * thousands of rows to exercise the batching path.
 */
export default class SegmentRecomputeService {
  #batchSize: number

  constructor(batchSize = DEFAULT_BATCH_SIZE) {
    this.#batchSize = batchSize
  }

  /**
   * Streams matching contact ids in bounded batches (keyset pagination on
   * `contacts.id`, never a single unbounded `SELECT *`), `INSERT IGNORE`s
   * new members per batch, then removes stale members via a single SQL
   * anti-join (`whereNotIn` against the same evaluator query as a
   * subquery) rather than diffing full id sets in Node memory — the
   * "current matching ids" set is never materialized as a whole in this
   * process, only each batch (bounded by `batchSize`) and the (typically
   * much smaller) set of ids actually being removed, which ADR-003
   * explicitly flags as the risk to avoid at 1M-row scale.
   *
   * Idempotent: re-running with no contact changes since the last run
   * inserts/removes nothing and emits no membership events.
   */
  async full(segment: Segment): Promise<void> {
    const startedAt = Date.now()

    segment.lastComputationStatus = 'running'
    await segment.save()

    const customFieldTypes = await loadCustomFieldTypes(segment.projectId)

    let addedCount = 0
    let matchedCount = 0

    try {
      let lastId = 0
      for (;;) {
        const query = Contact.query().withScopes((scopes) =>
          scopes.forProject({ id: segment.projectId })
        )
        toQuery(segment.definition, query, customFieldTypes)
        const batch = await query
          .where('id', '>', lastId)
          .orderBy('id', 'asc')
          .limit(this.#batchSize)
          .select('id')

        if (batch.length === 0) break

        const batchIds = batch.map((contact) => contact.id)
        lastId = batchIds[batchIds.length - 1]
        matchedCount += batchIds.length

        const newIds = await this.#insertNewMembers(segment.id, batchIds)
        if (newIds.length > 0) {
          addedCount += newIds.length
          await SegmentMembershipAdded.dispatch(segment.id, newIds)
        }

        if (batchIds.length < this.#batchSize) break
      }

      const removedIds = await this.#deleteStaleMembers(segment, customFieldTypes)
      if (removedIds.length > 0) {
        await SegmentMembershipRemoved.dispatch(segment.id, removedIds)
      }

      segment.contactCountCache = matchedCount
      segment.lastComputedAt = DateTime.now()
      segment.lastComputationStatus = 'success'
      await segment.save()

      await SegmentRecomputed.dispatch(
        segment.id,
        addedCount,
        removedIds.length,
        Date.now() - startedAt
      )
    } catch (error) {
      segment.lastComputationStatus = 'failed'
      await segment.save()
      throw error
    }
  }

  /**
   * Evaluates `definition` for a single contact and reconciles just that
   * one `segment_contacts` row (docs/plans/06-segments.md § Backend
   * architecture) — no-op, and no event emitted, if membership didn't
   * change.
   */
  async targeted(segment: Segment, contact: Contact): Promise<void> {
    const startedAt = Date.now()

    const customFieldTypes = await loadCustomFieldTypes(segment.projectId)
    const query = Contact.query().where('id', contact.id)
    toQuery(segment.definition, query, customFieldTypes)
    const matches = (await query.first()) !== null

    const existing = await SegmentContact.query()
      .where('segmentId', segment.id)
      .where('contactId', contact.id)
      .first()

    if (matches && !existing) {
      await SegmentContact.create({
        segmentId: segment.id,
        contactId: contact.id,
        addedAt: DateTime.now(),
      })
      segment.contactCountCache += 1
      segment.lastComputedAt = DateTime.now()
      await segment.save()

      await SegmentMembershipAdded.dispatch(segment.id, [contact.id])
      await SegmentRecomputed.dispatch(segment.id, 1, 0, Date.now() - startedAt)
      return
    }

    if (!matches && existing) {
      await existing.delete()
      segment.contactCountCache = Math.max(0, segment.contactCountCache - 1)
      segment.lastComputedAt = DateTime.now()
      await segment.save()

      await SegmentMembershipRemoved.dispatch(segment.id, [contact.id])
      await SegmentRecomputed.dispatch(segment.id, 0, 1, Date.now() - startedAt)
    }
  }

  async #insertNewMembers(segmentId: number, contactIds: number[]): Promise<number[]> {
    if (contactIds.length === 0) return []

    const existingRows = await SegmentContact.query()
      .where('segmentId', segmentId)
      .whereIn('contactId', contactIds)
      .select('contactId')
    const existingIds = new Set(existingRows.map((row) => row.contactId))
    const newIds = contactIds.filter((id) => !existingIds.has(id))
    if (newIds.length === 0) return []

    const now = DateTime.now().toSQL()
    const rows = newIds.map((contactId) => [segmentId, contactId, now])
    const placeholders = rows.map(() => '(?, ?, ?)').join(', ')

    // Genuine `INSERT IGNORE` (rather than relying solely on the precheck
    // above) so a concurrent recompute of the same segment can never
    // violate the `(segment_id, contact_id)` unique constraint.
    await db.rawQuery(
      `INSERT IGNORE INTO segment_contacts (segment_id, contact_id, added_at) VALUES ${placeholders}`,
      rows.flat()
    )

    return newIds
  }

  async #deleteStaleMembers(
    segment: Segment,
    customFieldTypes: Record<string, CustomFieldType>
  ): Promise<number[]> {
    const matchingIds = Contact.query()
      .withScopes((scopes) => scopes.forProject({ id: segment.projectId }))
      .select('id')
    toQuery(segment.definition, matchingIds, customFieldTypes)

    const staleRows = await SegmentContact.query()
      .where('segmentId', segment.id)
      .whereNotIn('contactId', matchingIds)
      .select('contactId')
    const staleIds = staleRows.map((row) => row.contactId)
    if (staleIds.length === 0) return []

    await SegmentContact.query()
      .where('segmentId', segment.id)
      .whereIn('contactId', staleIds)
      .delete()

    return staleIds
  }
}

export interface SegmentRecomputePayload {
  segmentId: number
  mode: 'full' | 'targeted'
  contactId?: number
}

/** Registered as the `segments:segment.recompute` handler (start/jobs.ts). */
export async function recomputeSegmentJob(
  payload: SegmentRecomputePayload,
  _job: Job<SegmentRecomputePayload>
): Promise<void> {
  const segment = await Segment.find(payload.segmentId)
  if (!segment) return // the segment was deleted after this job was enqueued

  const service = new SegmentRecomputeService()

  if (payload.mode === 'full') {
    await service.full(segment)
    return
  }

  if (!payload.contactId) return
  const contact = await Contact.find(payload.contactId)
  if (!contact) return // the contact was hard-deleted (or never existed) since enqueueing

  await service.targeted(segment, contact)
}
