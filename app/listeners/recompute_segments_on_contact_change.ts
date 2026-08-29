import Segment from '#models/segment'
import ContactCreated from '#events/contact_created'
import type ContactUpdated from '#events/contact_updated'
import queueDispatcher from '#services/jobs/queue_dispatcher'

/**
 * Targeted, quasi-real-time recompute (docs/plans/06-segments.md § User
 * flows, ADR-003): on every contact create/update, enqueues a `targeted`
 * recompute only for the segments of that project whose
 * `referenced_fields` intersects the fields that just changed — never
 * re-evaluates every segment of the project on every contact write.
 *
 * `ContactCreated` has no "changed fields" list of its own (every field is
 * effectively new), so every segment of the project is a candidate rather
 * than trying to enumerate which fields a fresh contact "changed".
 */
export default class RecomputeSegmentsOnContactChange {
  async handle(event: ContactCreated | ContactUpdated) {
    const contact = event.contact

    const segments =
      event instanceof ContactCreated
        ? await Segment.query().where('projectId', contact.projectId)
        : await this.#segmentsReferencing(contact.projectId, event.changedFields)

    for (const segment of segments) {
      await queueDispatcher.dispatch('segments', 'segment.recompute', {
        segmentId: segment.id,
        mode: 'targeted',
        contactId: contact.id,
      })
    }
  }

  async #segmentsReferencing(projectId: number, changedFields: string[]): Promise<Segment[]> {
    const segments = await Segment.query().where('projectId', projectId)
    return segments.filter((segment) =>
      segment.referencedFields.some((field) => changedFields.includes(field))
    )
  }
}
