import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { signupValidator } from '#validators/user'
import OrganizationService from '#services/organizations/organization_service'
import type { HttpContext } from '@adonisjs/core/http'

const organizationService = new OrganizationService()

export default class NewAccountController {
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/signup', {})
  }

  async store({ request, response, auth, session }: HttpContext) {
    const { passwordConfirmation, ...payload } = await request.validateUsing(signupValidator)

    /**
     * A default organization is created for every new user so they land
     * straight in a working space instead of an empty "create your first
     * organization" screen (docs/plans/03-organizations.md § User flows).
     * Same transaction as the user creation: either both succeed or
     * neither does.
     */
    const { user, organization } = await db.transaction(async (trx) => {
      const newUser = await User.create({ ...payload }, { client: trx })
      const defaultOrganizationName = newUser.fullName
        ? `${newUser.fullName}'s organization`
        : `${newUser.email.split('@')[0]}'s organization`
      const newOrganization = await organizationService.create(
        newUser,
        { name: defaultOrganizationName },
        trx
      )

      return { user: newUser, organization: newOrganization }
    })

    await auth.use('web').login(user)
    session.put('organizationId', organization.id)

    return response.redirect().toRoute('organization_members.index', {
      organizationId: organization.id,
    })
  }
}
