import type { HttpContext } from '@adonisjs/core/http'
import Organization from '#models/organization'
import OrganizationPolicy from '#policies/organization_policy'
import OrganizationService from '#services/organizations/organization_service'
import { createOrganizationValidator, updateOrganizationValidator } from '#validators/organization'
import OrganizationTransformer from '#transformers/organization_transformer'

const organizationService = new OrganizationService()

export default class OrganizationsController {
  async index({ auth, inertia }: HttpContext) {
    const organizations = await Organization.query().withScopes((scopes) =>
      scopes.forUser(auth.user!)
    )

    return inertia.render('organizations/index', {
      organizations: OrganizationTransformer.transform(organizations),
    })
  }

  async create({ inertia }: HttpContext) {
    return inertia.render('organizations/create', {})
  }

  async store({ request, auth, response, session }: HttpContext) {
    const payload = await request.validateUsing(createOrganizationValidator)
    const organization = await organizationService.create(auth.user!, payload)

    session.put('organizationId', organization.id)
    session.flash('success', `${organization.name} was created.`)
    return response.redirect().toRoute('organization_members.index', {
      organizationId: organization.id,
    })
  }

  async show({ organization, bouncer, inertia }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', organization)

    return inertia.render('organizations/show', {
      organization: OrganizationTransformer.transform(organization),
    })
  }

  async update({ organization, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', organization)

    const payload = await request.validateUsing(updateOrganizationValidator)
    await organizationService.update(organization, payload)

    session.flash('success', 'Organization updated.')
    return response.redirect().back()
  }

  async destroy({ organization, bouncer, response, session }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('destroy', organization)

    await organizationService.delete(organization)

    session.flash('success', 'Organization deleted.')
    return response.redirect().toRoute('organizations.index')
  }

  async switch({ organization, session, response }: HttpContext) {
    session.put('organizationId', organization.id)

    return response.redirect().toRoute('organization_members.index', {
      organizationId: organization.id,
    })
  }
}
