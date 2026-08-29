import type { HttpContext } from '@adonisjs/core/http'
import Contact, { type ContactStatus } from '#models/contact'
import ContactService from '#services/contacts/contact_service'
import ContactQueryService from '#services/contacts/contact_query_service'
import { createContactValidator, updateContactValidator } from '#validators/contact'
import ContactTransformer from '#transformers/contact_transformer'

const contactService = new ContactService()
const contactQueryService = new ContactQueryService()

/**
 * Public API surface for external services to manage contacts
 * (docs/plans README: "API with authentication"), authenticated via
 * `middleware.apiKeyAuth()` (`app/middleware/api_key_auth_middleware.ts`)
 * rather than a browser session — `ctx.project` is resolved from the key,
 * and there's no end-user role to check against, so unlike the Inertia
 * `ContactsController` these actions never call `bouncer`/`ContactPolicy`.
 * Every mutation goes through the same `ContactService`/`ContactTagService`
 * the web UI uses, so behavior (email uniqueness, status transitions, soft
 * delete, segment-recompute-triggering tag changes) is identical either way.
 */
export default class ApiContactsController {
  async index({ project, request, serialize }: HttpContext) {
    const filters = {
      search: request.input('search') || undefined,
      status: (request.input('status') || undefined) as ContactStatus | undefined,
      tagId: request.input('tagId') ? Number(request.input('tagId')) : undefined,
      tag: request.input('tag') || undefined,
      page: request.input('page') ? Number(request.input('page')) : undefined,
    }

    const page = await contactQueryService.paginate(project, filters)
    return serialize(ContactTransformer.paginate(page.all(), page.getMeta()))
  }

  async store({ project, request, apiKey, serialize, response }: HttpContext) {
    const payload = await request.validateUsing(createContactValidator, {
      meta: { projectId: project.id },
    })
    const contact = await contactService.create(project, apiKey.creator, payload)

    response.status(201)
    return serialize(ContactTransformer.transform(contact))
  }

  async show({ project, params, serialize, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .preload('tags')
      .first()

    if (!contact) {
      return response.status(404).send({ errors: [{ message: 'Contact not found' }] })
    }

    return serialize(ContactTransformer.transform(contact))
  }

  async update({ project, params, request, apiKey, serialize, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .first()

    if (!contact) {
      return response.status(404).send({ errors: [{ message: 'Contact not found' }] })
    }

    const payload = await request.validateUsing(updateContactValidator, {
      meta: { projectId: project.id, contactId: contact.id },
    })
    await contactService.update(contact, apiKey.creator, payload)

    return serialize(ContactTransformer.transform(contact))
  }

  async destroy({ project, params, apiKey, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .first()

    if (!contact) {
      return response.status(404).send({ errors: [{ message: 'Contact not found' }] })
    }

    await contactService.softDelete(contact, apiKey.creator)

    return response.status(204).send('')
  }
}
