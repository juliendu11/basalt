import type { HttpContext } from '@adonisjs/core/http'
import Contact from '#models/contact'
import Tag from '#models/tag'
import CustomFieldDefinition from '#models/custom_field_definition'
import ContactPolicy from '#policies/contact_policy'
import ContactService from '#services/contacts/contact_service'
import ContactQueryService from '#services/contacts/contact_query_service'
import UnsubscribeService from '#services/unsubscribe/unsubscribe_service'
import UpcomingSendsService from '#services/automation/upcoming_sends_service'
import { createContactValidator, updateContactValidator } from '#validators/contact'
import ContactTransformer from '#transformers/contact_transformer'
import TagTransformer from '#transformers/tag_transformer'
import ProjectTransformer from '#transformers/project_transformer'
import CustomFieldDefinitionTransformer from '#transformers/custom_field_definition_transformer'
import type { ContactStatus } from '#models/contact'

const contactService = new ContactService()
const contactQueryService = new ContactQueryService()
const unsubscribeService = new UnsubscribeService()
const upcomingSendsService = new UpcomingSendsService()

export default class ContactsController {
  async index({ project, request, inertia, serialize }: HttpContext) {
    const filters = {
      search: request.input('search') || undefined,
      status: (request.input('status') || undefined) as ContactStatus | undefined,
      tagId: request.input('tagId') ? Number(request.input('tagId')) : undefined,
      page: request.input('page') ? Number(request.input('page')) : undefined,
    }

    const page = await contactQueryService.paginate(project, filters)
    const contacts = await serialize(ContactTransformer.paginate(page.all(), page.getMeta()))

    const tags = await Tag.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('name', 'asc')

    return inertia.render('contacts/index', {
      project: ProjectTransformer.transform(project),
      contacts,
      tags: TagTransformer.transform(tags),
      filters,
    })
  }

  async create({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('create', project)

    const customFieldDefinitions = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('label', 'asc')

    return inertia.render('contacts/create', {
      project: ProjectTransformer.transform(project),
      customFieldDefinitions: CustomFieldDefinitionTransformer.transform(customFieldDefinitions),
    })
  }

  async store({ project, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('create', project)

    const payload = await request.validateUsing(createContactValidator, {
      meta: { projectId: project.id },
    })
    const contact = await contactService.create(project, auth.user!, payload)

    session.flash('success', `${contact.email} was added.`)
    return response.redirect().toRoute('contacts.show', {
      organizationId: project.organizationId,
      projectId: project.id,
      contactId: contact.id,
    })
  }

  async show({ project, params, inertia, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .preload('tags')
      .first()

    if (!contact) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    const upcomingSends = await upcomingSendsService.forContact(contact)

    return inertia.render('contacts/show', {
      contact: ContactTransformer.transform(contact),
      project: ProjectTransformer.transform(project),
      upcomingSends: upcomingSends.map((send) => ({
        campaignId: send.campaignId,
        campaignName: send.campaignName,
        campaignStatus: send.campaignStatus,
        nodeId: send.nodeId,
        emailId: send.emailId,
        subject: send.subject,
        estimatedSendAt: send.estimatedSendAt.toISO(),
        certainty: send.certainty,
      })),
    })
  }

  async edit({ project, params, bouncer, inertia, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .first()

    if (!contact) {
      response.status(404)
      return inertia.render('errors/not_found', {})
    }

    await bouncer.with(ContactPolicy).authorize('update', project)

    const customFieldDefinitions = await CustomFieldDefinition.query()
      .withScopes((scopes) => scopes.forProject(project))
      .orderBy('label', 'asc')

    return inertia.render('contacts/edit', {
      contact: ContactTransformer.transform(contact),
      project: ProjectTransformer.transform(project),
      customFieldDefinitions: CustomFieldDefinitionTransformer.transform(customFieldDefinitions),
    })
  }

  async update({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('update', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    const payload = await request.validateUsing(updateContactValidator, {
      meta: { projectId: project.id, contactId: contact.id },
    })
    await contactService.update(contact, auth.user!, payload)

    session.flash('success', 'Contact updated.')
    return response.redirect().back()
  }

  async destroy({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('destroy', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    await contactService.softDelete(contact, auth.user!)

    session.flash('success', 'Contact deleted.')
    return response.redirect().toRoute('contacts.index', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }

  async unsubscribe({ project, params, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('unsubscribe', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    await unsubscribeService.unsubscribe(contact, 'manual')

    session.flash('success', 'Contact unsubscribed.')
    return response.redirect().back()
  }

  async resubscribe({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('resubscribe', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    await unsubscribeService.resubscribe(contact, auth.user!.id)

    session.flash('success', 'Contact resubscribed.')
    return response.redirect().back()
  }
}
