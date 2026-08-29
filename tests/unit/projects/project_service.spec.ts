import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import Project from '#models/project'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()

test.group('ProjectService', () => {
  test('create() derives a slug from the name', async ({ assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const project = await projectService.create(organization, owner, {
      name: 'Marketing Site',
      timezone: 'Europe/Paris',
    })

    assert.equal(project.slug, 'marketing-site')
    assert.equal(project.organizationId, organization.id)
    assert.deepEqual(project.settings, {})
  })

  test('create() appends a numeric suffix on slug collision within the organization', async ({
    assert,
  }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const first = await projectService.create(organization, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })
    const second = await projectService.create(organization, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    assert.equal(first.slug, 'site')
    assert.equal(second.slug, 'site-2')
  })

  test('create() allows the same slug to be reused across different organizations', async ({
    assert,
  }) => {
    const owner = await UserFactory.create()
    const organizationA = await organizationService.create(owner, { name: 'A' })
    const organizationB = await organizationService.create(owner, { name: 'B' })

    const projectA = await projectService.create(organizationA, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })
    const projectB = await projectService.create(organizationB, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    assert.equal(projectA.slug, 'site')
    assert.equal(projectB.slug, 'site')
  })

  test('create() honors an explicit slug', async ({ assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const project = await projectService.create(organization, owner, {
      name: 'Marketing Site',
      timezone: 'Europe/Paris',
      slug: 'custom-slug',
    })

    assert.equal(project.slug, 'custom-slug')
  })

  test('delete() removes the project', async ({ assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Site',
      timezone: 'Europe/Paris',
    })

    await projectService.delete(project, owner)

    assert.isNull(await Project.find(project.id))
  })
})
