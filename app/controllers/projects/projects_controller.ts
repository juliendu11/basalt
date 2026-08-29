import type { HttpContext } from '@adonisjs/core/http'
import Project from '#models/project'
import ProjectPolicy from '#policies/project_policy'
import ProjectService from '#services/projects/project_service'
import { createProjectValidator, updateProjectValidator } from '#validators/project'
import ProjectTransformer from '#transformers/project_transformer'
import OrganizationTransformer from '#transformers/organization_transformer'

const projectService = new ProjectService()

export default class ProjectsController {
  async index({ organization, inertia }: HttpContext) {
    const projects = await Project.query()
      .withScopes((scopes) => scopes.forOrganization(organization))
      .orderBy('name', 'asc')

    return inertia.render('projects/index', {
      organization: OrganizationTransformer.transform(organization),
      organizationProjects: ProjectTransformer.transform(projects),
    })
  }

  async create({ organization, bouncer, inertia }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('create', organization)

    return inertia.render('projects/create', {
      organization: OrganizationTransformer.transform(organization),
    })
  }

  async store({ organization, request, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('create', organization)

    const payload = await request.validateUsing(createProjectValidator)
    const project = await projectService.create(organization, auth.user!, payload)

    session.put('projectId', project.id)
    session.flash('success', `${project.name} was created.`)
    return response.redirect().toRoute('projects.show', {
      organizationId: organization.id,
      projectId: project.id,
    })
  }

  async show({ project, inertia }: HttpContext) {
    return inertia.render('projects/show', {
      project: ProjectTransformer.transform(project),
    })
  }

  async settings({ project, bouncer, inertia }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('update', project)

    return inertia.render('projects/settings', {
      project: ProjectTransformer.transform(project),
    })
  }

  async update({ project, request, bouncer, response, session }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('update', project)

    const payload = await request.validateUsing(updateProjectValidator)
    await projectService.update(project, payload)

    session.flash('success', 'Project updated.')
    return response.redirect().back()
  }

  async destroy({ organization, project, auth, bouncer, response, session }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('destroy', project)

    await projectService.delete(project, auth.user!)

    session.flash('success', 'Project deleted.')
    return response.redirect().toRoute('projects.index', { organizationId: organization.id })
  }

  async switch({ project, bouncer, session, response }: HttpContext) {
    await bouncer.with(ProjectPolicy).authorize('view', project)

    session.put('projectId', project.id)

    return response.redirect().toRoute('projects.show', {
      organizationId: project.organizationId,
      projectId: project.id,
    })
  }
}
