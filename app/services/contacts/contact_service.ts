import { DateTime } from 'luxon'
import type User from '#models/user'
import type Project from '#models/project'
import Contact, { type ContactStatus } from '#models/contact'
import ContactCreated from '#events/contact_created'
import ContactUpdated from '#events/contact_updated'
import ContactDeleted from '#events/contact_deleted'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

export interface ContactPayload {
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  company?: string | null
  country?: string | null
  city?: string | null
  language?: string | null
  timezone?: string | null
  customFields?: Record<string, string | number | boolean | null>
}

/**
 * `bounced`/`complained`/`blocked` → `unsubscribed` (docs/plans/17-unsubscribe.md
 * § Edge cases: "désabonnement manuel d'un contact déjà bounced/complained/
 * blocked → autorisé") — a manual/link unsubscribe must always be reachable
 * from any non-`subscribed` state, not just from `subscribed` itself.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<ContactStatus, Set<ContactStatus>> = {
  subscribed: new Set(['unsubscribed', 'bounced', 'complained', 'blocked']),
  unsubscribed: new Set(['subscribed']),
  bounced: new Set(['subscribed', 'unsubscribed']),
  complained: new Set(['subscribed', 'unsubscribed']),
  blocked: new Set(['subscribed', 'unsubscribed']),
}

const DIFFABLE_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'company',
  'country',
  'city',
  'language',
  'timezone',
  'customFields',
] as const

export default class ContactService {
  /**
   * The validator already enforces per-project email uniqueness
   * (app/validators/contact.ts), but re-checks here defensively against a
   * concurrent request racing past that check — reported the same clean
   * way rather than surfacing a raw SQL unique-constraint error
   * (docs/plans/05-contacts.md § Services).
   */
  async create(project: Project, actor: User, payload: ContactPayload): Promise<Contact> {
    await this.#assertEmailAvailable(project, payload.email)

    const contact = await Contact.create({
      projectId: project.id,
      email: payload.email,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      phone: payload.phone ?? null,
      company: payload.company ?? null,
      country: payload.country ?? null,
      city: payload.city ?? null,
      language: payload.language ?? null,
      timezone: payload.timezone ?? null,
      status: 'subscribed',
      customFields: payload.customFields ?? {},
    })

    await ContactCreated.dispatch(contact, actor)

    return contact
  }

  /**
   * Emits `ContactUpdated` with the list of changed fields, used by segment
   * recalculation (docs/plans/06-segments.md) to target only the affected
   * segments.
   */
  async update(contact: Contact, actor: User, payload: ContactPayload): Promise<Contact> {
    if (payload.email !== contact.email) {
      await this.#assertEmailAvailable({ id: contact.projectId }, payload.email, contact.id)
    }

    contact.merge({
      email: payload.email,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      phone: payload.phone ?? null,
      company: payload.company ?? null,
      country: payload.country ?? null,
      city: payload.city ?? null,
      language: payload.language ?? null,
      timezone: payload.timezone ?? null,
      customFields: payload.customFields ?? {},
    })

    const changedFields = DIFFABLE_FIELDS.filter((field) => contact.$dirty[field] !== undefined)

    await contact.save()

    if (changedFields.length > 0) {
      await ContactUpdated.dispatch(contact, actor, changedFields)
    }

    return contact
  }

  /**
   * Soft delete only in this phase: cascading active `campaign_enrollments`
   * to `cancelled` (docs/plans/05-contacts.md § Services) is deferred until
   * that table exists (docs/plans/11-campaign-enrollment.md).
   */
  async softDelete(contact: Contact, actor: User): Promise<void> {
    contact.deletedAt = DateTime.now()
    await contact.save()

    await ContactDeleted.dispatch(contact, actor)
  }

  /**
   * `contacts.status` state machine (docs/plans/05-contacts.md § Domain
   * concepts). No route exercises this in v1 — the transitions matter for
   * later phases (bounce/complaint processing, the unsubscribe link in
   * docs/plans/17-unsubscribe.md) that call into this method directly, but
   * the rule is enforced and tested from this phase on.
   */
  async changeStatus(contact: Contact, status: ContactStatus): Promise<Contact> {
    if (status !== contact.status && !ALLOWED_STATUS_TRANSITIONS[contact.status].has(status)) {
      throw new BusinessRuleViolation(`A contact cannot move from ${contact.status} to ${status}.`)
    }

    contact.status = status
    await contact.save()
    return contact
  }

  /** Edge cases — a restored contact does not reactivate old enrollments. */
  async restore(contact: Contact): Promise<Contact> {
    contact.deletedAt = null
    await contact.save()
    return contact
  }

  async #assertEmailAvailable(
    project: { id: number },
    email: string,
    excludeContactId?: number
  ): Promise<void> {
    const query = Contact.query()
      .where('projectId', project.id)
      .where('email', email)
      .whereNull('deletedAt')

    if (excludeContactId) {
      query.whereNot('id', excludeContactId)
    }

    if (await query.first()) {
      throw new BusinessRuleViolation(`A contact with the email ${email} already exists.`)
    }
  }
}
