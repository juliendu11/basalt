import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import EmailService from '#services/emails/email_service'
import EmailLayoutService from '#services/emails/email_layout_service'
import SegmentService from '#services/segments/segment_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'
import CampaignEdge from '#models/campaign_edge'
import BusinessRuleViolation from '#exceptions/business_rule_violation'
import type { BuilderEdge, BuilderNode } from '#types/campaign_graph'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const campaignService = new CampaignService()
const emailService = new EmailService()
const emailLayoutService = new EmailLayoutService()
const segmentService = new SegmentService()
const builderService = new CampaignBuilderService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  const segment = await segmentService.save(project, {
    name: 'All contacts',
    definition: { combinator: 'AND', conditions: [] },
  })
  return { owner, organization, project, segment }
}

function sourceNode(clientKey: string, segmentId: number): BuilderNode {
  return {
    clientKey,
    type: 'source',
    subtype: 'segment',
    config: { segmentId },
    position: { x: 0, y: 0 },
  }
}

function waitNode(clientKey: string, durationValue = 1): BuilderNode {
  return {
    clientKey,
    type: 'action',
    subtype: 'wait',
    config: { durationValue, durationUnit: 'hours' },
    position: { x: 0, y: 0 },
  }
}

test.group('CampaignBuilderService.saveDraft', () => {
  test('rejects writing to a non-draft version', async ({ assert }) => {
    const { owner, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)
    version.status = 'published'
    await version.save()

    await assert.rejects(
      () => builderService.saveDraft(version, { nodes: [], edges: [] }),
      BusinessRuleViolation
    )
  })

  test('adds, updates, and deletes nodes by client_key across saves', async ({ assert }) => {
    const { owner, project, segment } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

    await builderService.saveDraft(version, {
      nodes: [sourceNode('src', segment.id), waitNode('w1', 1)],
      edges: [{ sourceClientKey: 'src', targetClientKey: 'w1', sourceHandle: null }],
    })

    let nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    assert.lengthOf(nodes, 2)

    // Second save: "w1"'s config changes, and a new "w2" node is added,
    // replacing the edge.
    await builderService.saveDraft(version, {
      nodes: [sourceNode('src', segment.id), waitNode('w1', 5), waitNode('w2', 2)],
      edges: [
        { sourceClientKey: 'src', targetClientKey: 'w1', sourceHandle: null },
        { sourceClientKey: 'w1', targetClientKey: 'w2', sourceHandle: null },
      ],
    })

    nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    assert.lengthOf(nodes, 3)
    const w1 = nodes.find((n) => n.clientKey === 'w1')!
    assert.equal(w1.config.durationValue, 5)

    // Third save: "w2" is removed.
    await builderService.saveDraft(version, {
      nodes: [sourceNode('src', segment.id), waitNode('w1', 5)],
      edges: [{ sourceClientKey: 'src', targetClientKey: 'w1', sourceHandle: null }],
    })

    nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    assert.lengthOf(nodes, 2)
    assert.isUndefined(nodes.find((n) => n.clientKey === 'w2'))

    const edges = await CampaignEdge.query().where('campaignVersionId', version.id)
    assert.lengthOf(edges, 1)
  })

  test('rejects a node config that fails subtype validation', async ({ assert }) => {
    const { owner, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

    const badNode: BuilderNode = {
      clientKey: 'w1',
      type: 'action',
      subtype: 'wait',
      config: { durationValue: 'not-a-number' },
      position: { x: 0, y: 0 },
    }

    await assert.rejects(
      () => builderService.saveDraft(version, { nodes: [badNode], edges: [] }),
      BusinessRuleViolation
    )

    const nodes = await CampaignNode.query().where('campaignVersionId', version.id)
    assert.lengthOf(nodes, 0)
  })

  test('rejects a config referencing an entity from another project', async ({ assert }) => {
    const { owner, project } = await createProject()
    const { project: otherProject } = await createProject()

    const foreignEmail = await emailService.create(otherProject, owner, {
      name: 'Foreign',
      subject: 'Hi',
      senderName: 'Acme',
      senderEmail: 'acme@example.com',
      htmlContent: '<p>hi</p>',
    })

    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

    const sendEmail: BuilderNode = {
      clientKey: 'send',
      type: 'action',
      subtype: 'send_email',
      config: { emailId: foreignEmail.id },
      position: { x: 0, y: 0 },
    }

    await assert.rejects(
      () => builderService.saveDraft(version, { nodes: [sendEmail], edges: [] }),
      BusinessRuleViolation
    )
  })
})

test.group('CampaignBuilderService.publish', () => {
  async function publishableDraft() {
    const { owner, project, segment } = await createProject()
    const email = await emailService.create(project, owner, {
      name: 'Welcome email',
      subject: 'Hi {{ contact.firstname }}',
      senderName: 'Acme',
      senderEmail: 'acme@example.com',
      htmlContent: '<p>Welcome</p>',
      textContent: 'Welcome',
    })

    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

    const nodes: BuilderNode[] = [
      sourceNode('src', segment.id),
      {
        clientKey: 'send',
        type: 'action',
        subtype: 'send_email',
        config: { emailId: email.id },
        position: { x: 0, y: 0 },
      },
    ]
    const edges: BuilderEdge[] = [
      { sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null },
    ]
    await builderService.saveDraft(version, { nodes, edges })

    return { owner, project, campaign, version, email }
  }

  test('freezes send_email content and activates the campaign on first publish', async ({
    assert,
  }) => {
    const { owner, campaign, version, email } = await publishableDraft()

    await builderService.publish(version, owner)

    await campaign.refresh()
    assert.equal(campaign.status, 'active')
    assert.equal(campaign.publishedVersionId, version.id)
    assert.isNull(campaign.draftVersionId)

    await version.refresh()
    assert.equal(version.status, 'published')
    assert.isNotNull(version.publishedAt)

    const sendNode = await CampaignNode.query()
      .where('campaignVersionId', version.id)
      .where('clientKey', 'send')
      .firstOrFail()
    assert.equal(sendNode.config.subject, email.subject)
    assert.equal(sendNode.config.htmlContent, email.htmlContent)
    assert.equal(sendNode.config.textContent, email.textContent)
    assert.equal(sendNode.config.senderEmail, email.senderEmail)
  })

  test('freezes send_email textContent composed from the layout text frame', async ({ assert }) => {
    const { owner, project, segment } = await createProject()
    const layout = await emailLayoutService.create(project, owner, {
      name: 'Branding frame',
      htmlContent: '<header>Acme</header>{{ email_body }}',
      textContent: 'Acme\n{{ email_body }}',
    })
    const email = await emailService.createFromLayout(project, layout, owner, {
      name: 'Welcome email',
      subject: 'Hi {{ contact.firstname }}',
      senderName: 'Acme',
      senderEmail: 'acme@example.com',
      bodyContent: '<p>Welcome</p>',
      textContent: 'Welcome',
    })

    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)

    const nodes: BuilderNode[] = [
      sourceNode('src', segment.id),
      {
        clientKey: 'send',
        type: 'action',
        subtype: 'send_email',
        config: { emailId: email.id },
        position: { x: 0, y: 0 },
      },
    ]
    const edges: BuilderEdge[] = [
      { sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null },
    ]
    await builderService.saveDraft(version, { nodes, edges })

    await builderService.publish(version, owner)

    const sendNode = await CampaignNode.query()
      .where('campaignVersionId', version.id)
      .where('clientKey', 'send')
      .firstOrFail()
    assert.equal(sendNode.config.htmlContent, '<header>Acme</header><p>Welcome</p>')
    assert.equal(sendNode.config.textContent, 'Acme\nWelcome')
  })

  test('rejects publishing an invalid graph', async ({ assert }) => {
    const { owner, project } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Bad' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)
    // No source node saved at all -> invalid graph.

    await assert.rejects(() => builderService.publish(version, owner), BusinessRuleViolation)

    await campaign.refresh()
    assert.equal(campaign.status, 'draft')
  })

  test('archives the previous published version on republish', async ({ assert }) => {
    const { owner, campaign, version } = await publishableDraft()
    await builderService.publish(version, owner)
    await campaign.refresh()

    const newDraft = await builderService.cloneVersion(version, owner)
    await builderService.publish(newDraft, owner)

    await version.refresh()
    assert.equal(version.status, 'archived')

    await newDraft.refresh()
    assert.equal(newDraft.status, 'published')

    await campaign.refresh()
    assert.equal(campaign.publishedVersionId, newDraft.id)
    // Republishing keeps the campaign active, doesn't re-trigger the
    // draft->active transition logic incorrectly.
    assert.equal(campaign.status, 'active')
  })

  test('rejects a concurrent double-publish of the same draft', async ({ assert }) => {
    const { owner, version } = await publishableDraft()

    await builderService.publish(version, owner)

    // Simulate a second, concurrent request racing on the same
    // (now-stale) in-memory `version` instance, which still thinks it's
    // "draft" — the conditional UPDATE (`WHERE status = 'draft'`) must
    // catch this rather than trusting the in-memory status.
    const staleVersion = await CampaignVersion.findOrFail(version.id)
    staleVersion.status = 'draft'

    await assert.rejects(() => builderService.publish(staleVersion, owner), BusinessRuleViolation)
  })
})

test.group('CampaignBuilderService.cloneVersion / cloneVersionIntoCampaign', () => {
  test('cloneVersion copies nodes/edges into a new draft of the same campaign', async ({
    assert,
  }) => {
    const { owner, project, segment } = await createProject()
    const email = await emailService.create(project, owner, {
      name: 'Welcome email',
      subject: 'Hi',
      senderName: 'Acme',
      senderEmail: 'acme@example.com',
      htmlContent: '<p>Welcome</p>',
    })
    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)

    await builderService.saveDraft(draft, {
      nodes: [
        sourceNode('src', segment.id),
        {
          clientKey: 'send',
          type: 'action',
          subtype: 'send_email',
          config: { emailId: email.id },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [{ sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null }],
    })
    await builderService.publish(draft, owner)

    await campaign.refresh()
    const publishedVersion = await CampaignVersion.findOrFail(campaign.publishedVersionId)

    const newDraft = await builderService.cloneVersion(publishedVersion, owner)

    const clonedNodes = await CampaignNode.query().where('campaignVersionId', newDraft.id)
    assert.lengthOf(clonedNodes, 2)
    const clonedEdges = await CampaignEdge.query().where('campaignVersionId', newDraft.id)
    assert.lengthOf(clonedEdges, 1)

    // Independence: editing the clone doesn't touch the published version's rows.
    const clonedSendNode = clonedNodes.find((n) => n.clientKey === 'send')!
    clonedSendNode.config = { ...clonedSendNode.config, subject: 'Edited subject' }
    await clonedSendNode.save()

    const publishedSendNode = await CampaignNode.query()
      .where('campaignVersionId', publishedVersion.id)
      .where('clientKey', 'send')
      .firstOrFail()
    assert.notEqual(publishedSendNode.config.subject, 'Edited subject')

    await campaign.refresh()
    assert.equal(campaign.draftVersionId, newDraft.id)
  })

  test('cloneVersionIntoCampaign clones the graph into a different campaign', async ({
    assert,
  }) => {
    const { owner, project, segment } = await createProject()
    const campaign = await campaignService.create(project, owner, { name: 'Original' })
    const draft = await CampaignVersion.findOrFail(campaign.draftVersionId)
    await builderService.saveDraft(draft, {
      nodes: [sourceNode('src', segment.id)],
      edges: [],
    })

    const otherCampaign = await campaignService.create(project, owner, { name: 'Other' })

    const clonedDraft = await builderService.cloneVersionIntoCampaign(draft, otherCampaign, owner)

    assert.equal(clonedDraft.campaignId, otherCampaign.id)
    const clonedNodes = await CampaignNode.query().where('campaignVersionId', clonedDraft.id)
    assert.lengthOf(clonedNodes, 1)

    const originalNodes = await CampaignNode.query().where('campaignVersionId', draft.id)
    assert.lengthOf(originalNodes, 1)
  })
})
