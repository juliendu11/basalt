import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import EmailService from '#services/emails/email_service'
import SegmentService from '#services/segments/segment_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import CampaignVersion from '#models/campaign_version'
import CampaignNode from '#models/campaign_node'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const campaignService = new CampaignService()
const emailService = new EmailService()
const segmentService = new SegmentService()
const membershipService = new OrganizationMembershipService()

async function createFixtures() {
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
  const email = await emailService.create(project, owner, {
    name: 'Welcome email',
    subject: 'Hello {{ contact.firstname }}',
    senderName: 'Acme',
    senderEmail: 'hello@acme.test',
    htmlContent: '<p>Welcome!</p>',
  })
  return { owner, organization, project, segment, email }
}

test.group('Campaign builder (functional, end-to-end)', () => {
  test('save draft graph over HTTP, then publish, freezes content and creates an independent clone', async ({
    client,
    assert,
  }) => {
    const { owner, organization, project, segment, email } = await createFixtures()

    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    const basePath = `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}`

    // 1. Load the builder — should serve the (empty) auto-created draft.
    const showResponse = await client.get(`${basePath}/builder`).loginAs(owner)
    showResponse.assertStatus(200)

    // 2. Auto-save a minimal valid graph: segment source -> send_email.
    const saveResponse = await client
      .put(`${basePath}/builder`)
      .loginAs(owner)
      .withCsrfToken()
      .json({
        nodes: [
          {
            clientKey: 'src',
            type: 'source',
            subtype: 'segment',
            config: { segmentId: segment.id },
            position: { x: 0, y: 0 },
          },
          {
            clientKey: 'send',
            type: 'action',
            subtype: 'send_email',
            config: { emailId: email.id },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null }],
      })
    saveResponse.assertStatus(200)

    await campaign.refresh()
    const savedNodes = await CampaignNode.query().where(
      'campaignVersionId',
      campaign.draftVersionId as number
    )
    assert.lengthOf(savedNodes, 2)

    // 3. Publish (activate) — completes the Phase 8 stub via the real builder.
    const activateResponse = await client
      .post(`${basePath}/activate`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)
    activateResponse.assertStatus(302)

    await campaign.refresh()
    assert.equal(campaign.status, 'active')
    assert.isNotNull(campaign.publishedVersionId)
    assert.isNull(campaign.draftVersionId)

    const publishedVersion = await CampaignVersion.findOrFail(campaign.publishedVersionId)
    assert.equal(publishedVersion.status, 'published')

    // 4. The published send_email node's content is frozen from the Email
    // at publish time — editing the Email afterward must never retroactively
    // change it (decisions/ADR-004-campaign-versioning.md).
    const publishedSendNode = await CampaignNode.query()
      .where('campaignVersionId', publishedVersion.id)
      .where('clientKey', 'send')
      .firstOrFail()
    assert.equal(publishedSendNode.config.subject, 'Hello {{ contact.firstname }}')
    assert.equal(publishedSendNode.config.senderEmail, 'hello@acme.test')

    await emailService.update(email, owner, {
      name: email.name,
      subject: 'Changed after publish',
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      htmlContent: email.htmlContent ?? '',
    })
    await publishedSendNode.refresh()
    assert.equal(publishedSendNode.config.subject, 'Hello {{ contact.firstname }}')

    // 5. Re-opening the builder on an already-published campaign is a
    // read-only load — it never clones or persists a version, so opening
    // the builder and navigating away without saving leaves the campaign
    // untouched (docs/plans/11-campaign-builder.md § User flows).
    const reopenResponse = await client.get(`${basePath}/builder`).loginAs(owner)
    reopenResponse.assertStatus(200)

    await campaign.refresh()
    assert.isNull(campaign.draftVersionId)

    // 6. The first save from the re-opened builder is what clones a fresh,
    // independent draft from the published version.
    const resaveResponse = await client
      .put(`${basePath}/builder`)
      .loginAs(owner)
      .withCsrfToken()
      .json({
        nodes: [
          {
            clientKey: 'src',
            type: 'source',
            subtype: 'segment',
            config: { segmentId: segment.id },
            position: { x: 0, y: 0 },
          },
          {
            clientKey: 'send',
            type: 'action',
            subtype: 'send_email',
            config: { emailId: email.id },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ sourceClientKey: 'src', targetClientKey: 'send', sourceHandle: null }],
      })
    resaveResponse.assertStatus(200)

    await campaign.refresh()
    assert.isNotNull(campaign.draftVersionId)
    assert.notEqual(campaign.draftVersionId, publishedVersion.id)

    const clonedSendNode = await CampaignNode.query()
      .where('campaignVersionId', campaign.draftVersionId as number)
      .where('clientKey', 'send')
      .firstOrFail()

    clonedSendNode.config = { ...clonedSendNode.config, emailId: email.id, note: 'edited-in-draft' }
    await clonedSendNode.save()

    await publishedSendNode.refresh()
    assert.isUndefined(publishedSendNode.config.note)
  })

  test('a viewer cannot save the builder graph', async ({ client, assert }) => {
    const { owner, organization, project } = await createFixtures()
    const viewer = await UserFactory.create()
    const invitation = await membershipService.invite(organization, owner, {
      email: viewer.email,
      role: 'viewer',
    })
    await membershipService.accept(invitation, viewer)

    const campaign = await campaignService.create(project, owner, { name: 'Welcome series' })
    const basePath = `/organizations/${organization.id}/projects/${project.id}/campaigns/${campaign.id}`

    const response = await client
      .put(`${basePath}/builder`)
      .loginAs(viewer)
      .withCsrfToken()
      .redirects(0)
      .json({
        nodes: [
          {
            clientKey: 'src',
            type: 'source',
            subtype: 'segment',
            config: { segmentId: 999_999 },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      })

    // Bouncer's AuthorizationException redirects (302) rather than
    // returning a raw 403 for form-submission HTTP methods (PUT included)
    // — see tests/functional/organizations/organizations.spec.ts for the
    // same pattern. The guarantee that matters is DB state below.
    response.assertStatus(302)

    await campaign.refresh()
    const nodes = await CampaignNode.query().where(
      'campaignVersionId',
      campaign.draftVersionId as number
    )
    assert.lengthOf(nodes, 0)
  })
})
