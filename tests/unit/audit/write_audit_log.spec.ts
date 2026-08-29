import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import OrganizationMembershipService from '#services/organizations/organization_membership_service'
import ProjectService from '#services/projects/project_service'
import CampaignService from '#services/campaigns/campaign_service'
import CampaignBuilderService from '#services/campaigns/campaign_builder_service'
import SegmentService from '#services/segments/segment_service'
import CampaignVersion from '#models/campaign_version'
import AuditLog from '#models/audit_log'
import WriteAuditLog from '#listeners/write_audit_log'
import CampaignActivated from '#events/campaign_activated'

const organizationService = new OrganizationService()
const membershipService = new OrganizationMembershipService()
const projectService = new ProjectService()
const campaignService = new CampaignService()
const builderService = new CampaignBuilderService()
const segmentService = new SegmentService()
const listener = new WriteAuditLog()

test.group('WriteAuditLog', () => {
  test('OrganizationMemberInvited produces an audit_logs row', async ({ assert }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })

    const invitation = await membershipService.invite(organization, owner, {
      email: 'invitee@example.com',
      role: 'member',
    })

    const log = await AuditLog.query()
      .where('organizationId', organization.id)
      .where('action', 'organization.member_invited')
      .firstOrFail()

    assert.equal(log.entityType, 'organization_invitation')
    assert.equal(log.entityId, invitation.id)
    assert.equal(log.actorUserId, owner.id)
  })

  test('CampaignActivated (first publish) produces an audit_logs row, republish does not repeat it', async ({
    assert,
  }) => {
    const owner = await UserFactory.create()
    const organization = await organizationService.create(owner, { name: 'Acme' })
    const project = await projectService.create(organization, owner, {
      name: 'Marketing',
      timezone: 'Europe/Paris',
    })
    const seg = await segmentService.save(project, {
      name: 'All',
      definition: { combinator: 'AND', conditions: [] },
    })

    const campaign = await campaignService.create(project, owner, { name: 'Welcome' })
    const version = await CampaignVersion.findOrFail(campaign.draftVersionId)
    await builderService.saveDraft(version, {
      nodes: [
        {
          clientKey: 'src',
          type: 'source',
          subtype: 'segment',
          config: { segmentId: seg.id },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })

    await builderService.publish(version, owner)

    const activatedLogs = await AuditLog.query()
      .where('organizationId', organization.id)
      .where('action', 'campaign.activated')
    assert.lengthOf(activatedLogs, 1)
    assert.equal(activatedLogs[0].entityId, campaign.id)
    assert.equal(activatedLogs[0].actorUserId, owner.id)

    // Republishing (a new draft cloned from the now-published version) must
    // NOT dispatch a second CampaignActivated — publish() only fires it on
    // the campaign's first-ever activation (draft -> active), and this
    // campaign is already `active`.
    await campaign.refresh()
    const republishedVersion = await CampaignVersion.findOrFail(campaign.publishedVersionId)
    const newDraft = await builderService.cloneVersion(republishedVersion, owner)
    await builderService.publish(newDraft, owner)

    const afterRepublish = await AuditLog.query()
      .where('organizationId', organization.id)
      .where('action', 'campaign.activated')
    assert.lengthOf(afterRepublish, 1)

    // Direct handler invocation, independent of the publish() flow above —
    // asserts the listener maps the event to the correct, stable action
    // string and entity, per the plan's own guidance that `action` must
    // stay stable even if the event class is later renamed.
    await listener.handle(new CampaignActivated(campaign, owner))
    const directCallLog = await AuditLog.query()
      .where('organizationId', organization.id)
      .where('action', 'campaign.activated')
      .orderBy('id', 'desc')
      .firstOrFail()
    assert.equal(directCallLog.entityId, campaign.id)
  })
})
