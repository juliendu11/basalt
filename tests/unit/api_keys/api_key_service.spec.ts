import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ApiKeyService from '#services/api_keys/api_key_service'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const apiKeyService = new ApiKeyService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, project }
}

test.group('ApiKeyService', () => {
  test('generate returns a plaintext token that verifies back to the same key', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()

    const { apiKey, token } = await apiKeyService.generate(project, owner, { name: 'CRM sync' })

    assert.equal(apiKey.projectId, project.id)
    assert.equal(apiKey.createdBy, owner.id)
    assert.isTrue(token.startsWith('mtc_'))
    assert.notEqual(apiKey.tokenHash, token)

    const resolved = await apiKeyService.verify(token)
    assert.isNotNull(resolved)
    assert.equal(resolved!.id, apiKey.id)
    assert.equal(resolved!.project.id, project.id)
    assert.isNotNull(resolved!.lastUsedAt)
  })

  test('verify rejects an unknown token', async ({ assert }) => {
    const resolved = await apiKeyService.verify('mtc_not-a-real-token')
    assert.isNull(resolved)
  })

  test('verify rejects a revoked token', async ({ assert }) => {
    const { owner, project } = await createProject()
    const { apiKey, token } = await apiKeyService.generate(project, owner, { name: 'CRM sync' })

    await apiKeyService.revoke(apiKey)

    const resolved = await apiKeyService.verify(token)
    assert.isNull(resolved)
  })
})
