import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type User from '#models/user'
import type Organization from '#models/organization'
import Project from '#models/project'
import ProjectCreated from '#events/project_created'
import ProjectDeleted from '#events/project_deleted'
import { slugify } from '#utils/slugify'
import { storeUploadedImage, deleteUploadedImage } from '#utils/uploaded_image'

export default class ProjectService {
  /**
   * Creates a project in `organization`. If `payload.slug` isn't given, one
   * is derived from `payload.name`; either way, a numeric suffix is
   * appended on collision within the organization (docs/plans/04-projects.md
   * § Edge cases — slug is immutable after creation, so this is the only
   * place collisions are resolved automatically).
   */
  async create(
    organization: Organization,
    actor: User,
    payload: {
      name: string
      timezone: string
      slug?: string
      image?: MultipartFile
      defaultSenderName?: string
      defaultSenderEmail?: string
    }
  ): Promise<Project> {
    const slug = await this.#uniqueSlug(organization, payload.slug ?? payload.name)
    const imagePath = payload.image ? await storeUploadedImage(payload.image, 'projects') : null

    const project = await Project.create({
      organizationId: organization.id,
      name: payload.name,
      slug,
      timezone: payload.timezone,
      settings: {},
      imagePath,
      defaultSenderName: payload.defaultSenderName ?? null,
      defaultSenderEmail: payload.defaultSenderEmail ?? null,
    })

    await ProjectCreated.dispatch(project, actor)

    return project
  }

  async update(
    project: Project,
    payload: {
      name: string
      timezone: string
      image?: MultipartFile
      removeImage?: boolean
      defaultSenderName?: string
      defaultSenderEmail?: string
    }
  ): Promise<Project> {
    project.name = payload.name
    project.timezone = payload.timezone
    project.defaultSenderName = payload.defaultSenderName ?? null
    project.defaultSenderEmail = payload.defaultSenderEmail ?? null

    if (payload.image) {
      const previousImagePath = project.imagePath
      project.imagePath = await storeUploadedImage(payload.image, 'projects')
      await deleteUploadedImage(previousImagePath)
    } else if (payload.removeImage) {
      await deleteUploadedImage(project.imagePath)
      project.imagePath = null
    }

    await project.save()
    return project
  }

  /**
   * Cascades in the database to every domain table that will reference
   * `project_id` (contacts, segments, campaigns, ...) as those phases are
   * implemented. Stays synchronous for v1 — see docs/plans/04-projects.md
   * § Open questions for the async-job reconsideration.
   */
  async delete(project: Project, actor: User): Promise<void> {
    await ProjectDeleted.dispatch(project, actor)
    await project.delete()
    await deleteUploadedImage(project.imagePath)
  }

  async #uniqueSlug(organization: Organization, seed: string): Promise<string> {
    const base = slugify(seed) || 'project'
    let candidate = base
    let suffix = 2

    while (
      await Project.query()
        .where('organizationId', organization.id)
        .where('slug', candidate)
        .first()
    ) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }

    return candidate
  }
}
