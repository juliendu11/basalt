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
