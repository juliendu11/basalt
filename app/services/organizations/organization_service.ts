import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationOwnershipTransferred from '#events/organization_ownership_transferred'
import { slugify } from '#utils/slugify'
import { storeUploadedImage, deleteUploadedImage } from '#utils/uploaded_image'

/** Static allow-list (interpolated into DDL) of `contacts` and every table cascading from it. */
const CONTACT_RELATED_TABLES = [
  'contacts',
  'contact_tags',
  'segment_contacts',
  'campaign_enrollments',
  'campaign_executions',
  'email_deliveries',
  'email_events',
  'unsubscribe_tokens',
  'contact_unsubscribe_events',
]

export default class OrganizationService {
  /**
   * Creates an organization with the given user as its sole `owner`
   * (docs/plans/03-organizations.md § Services).
   *
   * Accepts an optional pre-opened transaction so callers that need this
   * atomic with other writes (e.g. NewAccountController creating the
   * default organization together with the user itself) can join it,
   * instead of this method silently opening its own separate transaction.
   */
  async create(
    user: User,
    payload: { name: string; image?: MultipartFile },
    trx?: TransactionClientContract
  ): Promise<Organization> {
    const run = async (client: TransactionClientContract) => {
      const slug = await this.#uniqueSlug(payload.name, client)
      const imagePath = payload.image
        ? await storeUploadedImage(payload.image, 'organizations')
        : null

      const organization = await Organization.create(
        { name: payload.name, slug, ownerUserId: user.id, imagePath },
        { client }
      )

      await OrganizationMembership.create(
        {
          organizationId: organization.id,
          userId: user.id,
          role: 'owner',
          joinedAt: DateTime.now(),
        },
        { client }
      )

      return organization
    }

    return trx ? run(trx) : db.transaction(run)
  }

  async update(
    organization: Organization,
    payload: { name: string; image?: MultipartFile; removeImage?: boolean }
  ): Promise<Organization> {
    organization.name = payload.name

    if (payload.image) {
      const previousImagePath = organization.imagePath
      organization.imagePath = await storeUploadedImage(payload.image, 'organizations')
      await deleteUploadedImage(previousImagePath)
    } else if (payload.removeImage) {
      await deleteUploadedImage(organization.imagePath)
      organization.imagePath = null
    }

    await organization.save()
    return organization
  }

  /**
   * Cascades in the database to memberships, invitations and — once
   * docs/plans/04-projects.md is implemented — every project and its data.
   */
  async delete(organization: Organization): Promise<void> {
    await organization.delete()
    await deleteUploadedImage(organization.imagePath)
  }

  /**
   * Hard-deletes every contact of every project in the organization (soft-deleted
   * ones included). Everything hanging off a contact — tags pivot, segment
   * memberships, campaign enrollments/executions, email deliveries/events,
   * unsubscribe tokens/events — is removed by the `ON DELETE CASCADE` foreign
   * keys. Auto-increment counters of these tables are then reset (to 1 when empty).
   * Returns the number of deleted contacts.
   */
  async truncateContacts(organization: Organization): Promise<number> {
    const deleted = await db
      .from('contacts')
      .whereIn(
        'project_id',
        db.from('projects').select('id').where('organization_id', organization.id)
      )
      .delete()

    // Ids are shared across organizations, so a true reset to 1 is only possible
    // when nothing is left: the engine clamps AUTO_INCREMENT to MAX(id)+1 otherwise.
    for (const table of CONTACT_RELATED_TABLES) {
      await db.rawQuery(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`)
    }

    return Number(deleted)
  }

  /**
   * Moves `owner` from the current owner to `newOwnerMembership.user`,
   * demoting the previous owner to `admin` (never leaving the
   * organization without an owner). See docs/plans/03-organizations.md
   * § Domain concepts.
   */
  async transferOwnership(
    organization: Organization,
    newOwnerMembership: OrganizationMembership
  ): Promise<Organization> {
    const previousOwnerUserId = organization.ownerUserId

    await db.transaction(async (trx) => {
      organization.useTransaction(trx)
      organization.ownerUserId = newOwnerMembership.userId
      await organization.save()

      const previousOwnerMembership = await OrganizationMembership.query({ client: trx })
        .where('organizationId', organization.id)
        .where('userId', previousOwnerUserId)
        .firstOrFail()
      previousOwnerMembership.role = 'admin'
      await previousOwnerMembership.useTransaction(trx).save()

      newOwnerMembership.role = 'owner'
      await newOwnerMembership.useTransaction(trx).save()
    })

    await OrganizationOwnershipTransferred.dispatch(
      organization,
      previousOwnerUserId,
      newOwnerMembership.userId
    )

    return organization
  }

  async #uniqueSlug(name: string, trx: TransactionClientContract): Promise<string> {
    const base = slugify(name) || 'organization'
    let candidate = base
    let suffix = 2

    while (await Organization.query({ client: trx }).where('slug', candidate).first()) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }

    return candidate
  }
}
