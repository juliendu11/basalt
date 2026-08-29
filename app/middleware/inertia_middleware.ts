import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import OrganizationMembership from '#models/organization_membership'
import Project from '#models/project'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type { OrganizationRole } from '#types/roles'

interface SharedOrganization {
  [key: string]: number | string | null
  id: number
  name: string
  slug: string
  role: OrganizationRole
  imageUrl: string | null
}

interface SharedProject {
  [key: string]: number | string | null
  id: number
  name: string
  slug: string
  imageUrl: string | null
}

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    /**
     * The share method is called everytime an Inertia page is rendered. In
     * certain cases, a page may get rendered before the session middleware
     * or the auth middleware are executed. For example: During a 404 request.
     *
     * In that case, we must always assume that HttpContext is not fully hydrated
     * with all the properties
     */
    const { auth, session } = ctx as Partial<HttpContext>

    const organizations = auth?.user ? await this.#sharedOrganizations(auth.user) : []
    const activeOrganizationId = session?.get('organizationId') as number | undefined
    const currentOrganization = organizations.find((o) => o.id === activeOrganizationId) ?? null

    const projects = currentOrganization ? await this.#sharedProjects(currentOrganization.id) : []
    const activeProjectId = session?.get('projectId') as number | undefined
    const currentProject = projects.find((p) => p.id === activeProjectId) ?? null

    /**
     * Data shared with all Inertia pages. Make sure you are using
     * transformers for rich data-types like Models.
     *
     * `organizations`/`currentOrganization`/`projects`/`currentProject` are
     * deliberately minimal (docs/plans/19-security.md § Security
     * considerations) — never more than what's needed to render the
     * organization/project switchers.
     */
    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      user: ctx.inertia.always(auth?.user ? UserTransformer.transform(auth.user) : undefined),
      organizations: ctx.inertia.always(organizations),
      currentOrganization: ctx.inertia.always(currentOrganization),
      projects: ctx.inertia.always(projects),
      currentProject: ctx.inertia.always(currentProject),
    }
  }

  async #sharedOrganizations(user: User): Promise<SharedOrganization[]> {
    const memberships = await OrganizationMembership.query()
      .where('userId', user.id)
      .whereNotNull('joinedAt')
      .preload('organization')
      .orderBy('joinedAt', 'asc')

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      imageUrl: membership.organization.imagePath ? `/${membership.organization.imagePath}` : null,
    }))
  }

  async #sharedProjects(organizationId: number): Promise<SharedProject[]> {
    const projects = await Project.query()
      .where('organizationId', organizationId)
      .orderBy('name', 'asc')

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      imageUrl: project.imagePath ? `/${project.imagePath}` : null,
    }))
  }

  /**
   * The flash bag is sent to every Inertia page as a top-level "flash" field
   * (a sibling of "props") and is read on the client using "usePage().flash".
   *
   * Just like the share method, the flash method may run before the session
   * middleware, so HttpContext must be treated as partially hydrated.
   */
  flash(ctx: HttpContext) {
    const { session } = ctx as Partial<HttpContext>

    /**
     * Fetching the first error from the flash messages
     */
    return {
      error: session?.flashMessages.get('error') as string | undefined,
      success: session?.flashMessages.get('success') as string | undefined,
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)

    const output = await next()
    this.dispose(ctx)

    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}
