import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Contact from '#models/contact'
import ContactPolicy from '#policies/contact_policy'
import ContactTagService from '#services/contacts/contact_tag_service'

const attachTagValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
})

const contactTagService = new ContactTagService()

export default class ContactTagsController {
  async attach({ project, params, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('update', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    const { name } = await request.validateUsing(attachTagValidator)

    const tag = await contactTagService.attach(project, contact, auth.user!, name)

    session.flash('success', `Tag "${tag.name}" added.`)
    return response.redirect().back()
  }

  async detach({ project, params, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('update', project)

    const contact = await Contact.query()
      .withScopes((scopes) => scopes.forProject(project))
      .where('id', params.contactId)
      .firstOrFail()

    await contactTagService.detach(contact, auth.user!, Number(params.tagId))

    session.flash('success', 'Tag removed.')
    return response.redirect().back()
  }
}
