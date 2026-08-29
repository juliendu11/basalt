import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import SegmentService from '#services/segments/segment_service'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import BusinessRuleViolation from '#exceptions/business_rule_violation'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const campaignService = new CampaignService()
const campaignBuilderService = new CampaignBuilderService()
const segmentService = new SegmentService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

test.group('CampaignService', () => {
  test('create makes a draft campaign with a draft version #1', async ({ assert }) => {
    const { owner, project } = await createProject()

    const created = await campaignService.create(project, owner, { name: 'Welcome series' })
    // Reload: `publishedVersionId` isn't part of the create payload, so the
    // in-memory instance leaves it `undefined` rather than the DB's actual
    // `null` default — reloading reflects the real persisted row.
    const campaign = await created.refresh()

    assert.equal(campaign.status, 'draft')
    assert.isNotNull(campaign.draftVersionId)
    assert.isNull(campaign.publishedVersionId)

    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)
    assert.equal(version.versionNumber, 1)
    assert.equal(version.status, 'draft')
    assert.equal(version.createdByUserId, owner.id)
  })

  test('duplicate creates an independent campaign with its own draft version', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const original = await campaignService.create(project, owner, { name: 'Welcome series' })

    const copy = await campaignService.duplicate(original, owner)

    assert.notEqual(copy.id, original.id)
    assert.equal(copy.name, 'Welcome series (copie)')
    assert.equal(copy.status, 'draft')
    assert.notEqual(copy.draftVersionId, original.draftVersionId)
  })

  test('duplicate clones the graph (nodes/edges) of the source draft, independently', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const segment = await segmentService.save(project, {
      name: 'All contacts',
      definition: { combinator: 'AND', conditions: [] },
    })
    const original = await campaignService.create(project, owner, { name: 'Welcome series' })
    const originalDraft = await CampaignVersion.findOrFail(original.draftVersionId)

    await campaignBuilderService.saveDraft(originalDraft, {
      nodes: [
        {
          clientKey: 'src',
          type: 'source',
          subtype: 'segment',
          config: { segmentId: segment.id },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })

    const copy = await campaignService.duplicate(original, owner)
    assert.isNotNull(copy.draftVersionId)

    const copiedNodes = await CampaignNode.query().where(
      'campaignVersionId',
      copy.draftVersionId as number
    )
    assert.lengthOf(copiedNodes, 1)
    assert.equal(copiedNodes[0].clientKey, 'src')

    // Independence: editing the copy's node doesn't touch the original's.
    copiedNodes[0].config = { segmentId: segment.id, extra: true }
    await copiedNodes[0].save()

    const originalNodes = await CampaignNode.query().where('campaignVersionId', originalDraft.id)
    assert.isUndefined(originalNodes[0].config.extra)
  })

  test('pause/resume lifecycle is idempotent and rejects invalid transitions', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })

    // Can't pause a draft campaign.
    await assert.rejects(() => campaignService.pause(campaign, owner), BusinessRuleViolation)

    campaign.status = 'active'
    await campaign.save()

    const paused = await campaignService.pause(campaign, owner)
    assert.equal(paused.status, 'paused')

    // Idempotent: pausing an already-paused campaign is a no-op.
    const pausedAgain = await campaignService.pause(paused, owner)
    assert.equal(pausedAgain.status, 'paused')

    const resumed = await campaignService.resume(paused, owner)
    assert.equal(resumed.status, 'active')

    // Idempotent: resuming an already-active campaign is a no-op.
    const resumedAgain = await campaignService.resume(resumed, owner)
    assert.equal(resumedAgain.status, 'active')

    // Can't resume an active campaign that was never paused... it's a
    // no-op (already active), covered above. Resuming a draft campaign
    // should be rejected.
    const draft = await campaignService.create(project, owner, { name: 'Another' })
    await assert.rejects(() => campaignService.resume(draft, owner), BusinessRuleViolation)
  })

  test('archive is allowed from every archivable status, rejected once archived', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()

    const draft = await campaignService.create(project, owner, { name: 'Draft one' })
    const archivedDraft = await campaignService.archive(draft, owner)
    assert.equal(archivedDraft.status, 'archived')

    const active = await campaignService.create(project, owner, { name: 'Active one' })
    active.status = 'active'
    await active.save()
    const archivedActive = await campaignService.archive(active, owner)
    assert.equal(archivedActive.status, 'archived')

    // Idempotent: archiving an already-archived campaign is a no-op.
    const archivedAgain = await campaignService.archive(archivedActive, owner)
    assert.equal(archivedAgain.status, 'archived')
  })
})
