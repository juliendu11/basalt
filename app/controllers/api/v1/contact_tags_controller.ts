import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Contact from '#models/contact'
import ContactTagService from '#services/contacts/contact_tag_service'
import ContactTransformer from '#transformers/contact_transformer'

const attachTagValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
})

const contactTagService = new ContactTagService()

/** Same `ContactTagService` as the web `ContactTagsController` — see its docstring. */
export default class ApiContactTagsController {
  async attach({ project, params, request, apiKey, serialize, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .first()

    if (!contact) {
      return response.status(404).send({ errors: [{ message: 'Contact not found' }] })
    }

    const { name } = await request.validateUsing(attachTagValidator)
    await contactTagService.attach(project, contact, apiKey.creator, name)
    await contact.load('tags')

    return serialize(ContactTransformer.transform(contact))
  }

  async detach({ project, params, apiKey, serialize, response }: HttpContext) {
    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .first()

    if (!contact) {
      return response.status(404).send({ errors: [{ message: 'Contact not found' }] })
    }

    await contactTagService.detach(contact, apiKey.creator, Number(params.tagId))
    await contact.load('tags')

    return serialize(ContactTransformer.transform(contact))
  }
}
