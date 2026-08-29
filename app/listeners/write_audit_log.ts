import { DateTime } from 'luxon'
import AuditLog from '#models/audit_log'
import Project from '#models/project'
import CampaignEnrollment from '#models/campaign_enrollment'
import EmailDelivery from '#models/email_delivery'
import OrganizationMemberInvited from '#events/organization_member_invited'
import OrganizationMemberJoined from '#events/organization_member_joined'
import OrganizationMemberRemoved from '#events/organization_member_removed'
import OrganizationOwnershipTransferred from '#events/organization_ownership_transferred'
import ProjectCreated from '#events/project_created'
import ProjectDeleted from '#events/project_deleted'
import SmtpConnectorCreated from '#events/smtp_connector_created'
import SmtpConnectorUpdated from '#events/smtp_connector_updated'
import SmtpConnectorDeleted from '#events/smtp_connector_deleted'
import SmtpConnectorDefaultChanged from '#events/smtp_connector_default_changed'
import EmailTemplateCreated from '#events/email_template_created'
import EmailTemplateUpdated from '#events/email_template_updated'
import EmailTemplateDeleted from '#events/email_template_deleted'
import EmailLayoutCreated from '#events/email_layout_created'
import EmailLayoutUpdated from '#events/email_layout_updated'
import EmailLayoutDeleted from '#events/email_layout_deleted'
import EmailCreated from '#events/email_created'
import EmailUpdated from '#events/email_updated'
import EmailDeleted from '#events/email_deleted'
import EmailPublished from '#events/email_published'
import CampaignActivated from '#events/campaign_activated'
import CampaignPaused from '#events/campaign_paused'
import CampaignResumed from '#events/campaign_resumed'
import CampaignArchived from '#events/campaign_archived'
import CampaignVersionPublished from '#events/campaign_version_published'
import CampaignExecutionCompleted from '#events/campaign_execution_completed'
import CampaignExecutionCancelled from '#events/campaign_execution_cancelled'
import CampaignExecutionFailed from '#events/campaign_execution_failed'
import CampaignEnrollmentCreated from '#events/campaign_enrollment_created'
import EmailDelivered from '#events/email_delivered'
import EmailBounced from '#events/email_bounced'
import EmailComplained from '#events/email_complained'
import ContactUnsubscribed from '#events/contact_unsubscribed'
import ContactResubscribed from '#events/contact_resubscribed'

type AuditableEvent =
  | OrganizationMemberInvited
  | OrganizationMemberJoined
  | OrganizationMemberRemoved
  | OrganizationOwnershipTransferred
  | ProjectCreated
  | ProjectDeleted
  | SmtpConnectorCreated
  | SmtpConnectorUpdated
  | SmtpConnectorDeleted
  | SmtpConnectorDefaultChanged
  | EmailTemplateCreated
  | EmailTemplateUpdated
  | EmailTemplateDeleted
  | EmailLayoutCreated
  | EmailLayoutUpdated
  | EmailLayoutDeleted
  | EmailCreated
  | EmailUpdated
  | EmailDeleted
  | EmailPublished
  | CampaignActivated
  | CampaignPaused
  | CampaignResumed
  | CampaignArchived
  | CampaignVersionPublished
  | CampaignExecutionCompleted
  | CampaignExecutionCancelled
  | CampaignExecutionFailed
  | CampaignEnrollmentCreated
  | EmailDelivered
  | EmailBounced
  | EmailComplained
  | ContactUnsubscribed
  | ContactResubscribed

interface AuditEntry {
  organizationId: number
  projectId: number | null
  actorUserId: number | null
  action: string
  entityType: string | null
  entityId: number | null
  metadata: Record<string, unknown>
}

/**
 * Single listener subscribed to every "auditable" event in the system,
 * writing one standardized `audit_logs` row per event rather than each
 * domain having to know about auditing itself (docs/plans/20-observability-and-audit.md).
 *
 * Grows by one branch per new auditable event as later phases are
 * implemented — register the same listener class against the new event
 * in start/events.ts and add a branch here.
 */
export default class WriteAuditLog {
  async handle(event: AuditableEvent) {
    const entry = await this.#toEntry(event)
    if (!entry) return

    await AuditLog.create({ ...entry, occurredAt: DateTime.now() })
  }

  /**
   * `SmtpConnector` only denormalizes `projectId` (not `organizationId`,
   * unlike `Project` — docs/plans/02-database-design.md), so its branches
   * below resolve `organizationId` with one extra lookup rather than
   * changing the model/event shape just for auditing.
   */
  async #organizationIdForProject(projectId: number): Promise<number> {
    const project = await Project.query().where('id', projectId).firstOrFail()
    return project.organizationId
  }

  /**
   * `CampaignExecutionCompleted`/`Cancelled`/`Failed` (docs/plans/12-campaign-engine.md
   * § Events) only carry IDs, not full model instances — deliberately
   * lightweight since the engine dispatches them on a hot path. Resolving
   * `organizationId`/`projectId` costs two extra lookups here, acceptable
   * given these are per-ENROLLMENT lifecycle events (one per contact per
   * campaign), not per-node-transition ones — `CampaignNodeCompleted`
   * (also named in the plan as audit-worthy) is deliberately NOT wired into
   * this listener: `campaign_execution_events` already exists as the
   * purpose-built, append-only journal for that exact per-transition
   * granularity, and duplicating every single node transition into
   * `audit_logs` too (a table whose own model doc comment frames it as a
   * log of "significant user actions") would be redundant at a volume this
   * table isn't sized for.
   */
  async #resolveEnrollmentContext(
    enrollmentId: number
  ): Promise<{ organizationId: number; projectId: number } | null> {
    const enrollment = await CampaignEnrollment.find(enrollmentId)
    if (!enrollment) return null

    const organizationId = await this.#organizationIdForProject(enrollment.projectId)
    return { organizationId, projectId: enrollment.projectId }
  }

  /**
   * `EmailDelivered`/`EmailBounced`/`EmailComplained` (docs/plans/16-email-tracking.md
   * § Events) are audited — bounded per send and state-affecting (a hard
   * bounce/complaint changes the contact's own status). `EmailOpened`/
   * `EmailClicked` are deliberately NOT wired into this listener, for the
   * same reason `CampaignNodeCompleted` isn't (see `#resolveEnrollmentContext`'s
   * doc comment above): a recipient can open/click the same email many
   * times, and `email_events` already exists as the purpose-built,
   * append-only journal for that engagement telemetry — duplicating it
   * into `audit_logs` at that volume would be redundant.
   */
  async #resolveDeliveryContext(
    deliveryId: number
  ): Promise<{ organizationId: number; projectId: number } | null> {
    const delivery = await EmailDelivery.find(deliveryId)
    if (!delivery) return null

    const organizationId = await this.#organizationIdForProject(delivery.projectId)
    return { organizationId, projectId: delivery.projectId }
  }

  async #toEntry(event: AuditableEvent): Promise<AuditEntry | null> {
    if (event instanceof OrganizationMemberInvited) {
      return {
        organizationId: event.invitation.organizationId,
        projectId: null,
        actorUserId: event.invitation.invitedByUserId,
        action: 'organization.member_invited',
        entityType: 'organization_invitation',
        entityId: event.invitation.id,
        metadata: { email: event.invitation.email, role: event.invitation.role },
      }
    }

    if (event instanceof OrganizationMemberJoined) {
      return {
        organizationId: event.membership.organizationId,
        projectId: null,
        actorUserId: event.membership.userId,
        action: 'organization.member_joined',
        entityType: 'organization_membership',
        entityId: event.membership.id,
        metadata: { role: event.membership.role },
      }
    }

    if (event instanceof OrganizationMemberRemoved) {
      return {
        organizationId: event.organization.id,
        projectId: null,
        actorUserId: event.actor.id,
        action: 'organization.member_removed',
        entityType: 'organization_membership',
        entityId: null,
        metadata: { removedUserId: event.removedUserId },
      }
    }

    if (event instanceof OrganizationOwnershipTransferred) {
      return {
        organizationId: event.organization.id,
        projectId: null,
        actorUserId: event.previousOwnerUserId,
        action: 'organization.ownership_transferred',
        entityType: 'organization',
        entityId: event.organization.id,
        metadata: {
          previousOwnerUserId: event.previousOwnerUserId,
          newOwnerUserId: event.newOwnerUserId,
        },
      }
    }

    if (event instanceof ProjectCreated) {
      return {
        organizationId: event.project.organizationId,
        projectId: event.project.id,
        actorUserId: event.actor.id,
        action: 'project.created',
        entityType: 'project',
        entityId: event.project.id,
        metadata: { name: event.project.name, slug: event.project.slug },
      }
    }

    if (event instanceof ProjectDeleted) {
      return {
        organizationId: event.project.organizationId,
        projectId: event.project.id,
        actorUserId: event.actor.id,
        action: 'project.deleted',
        entityType: 'project',
        entityId: event.project.id,
        metadata: { name: event.project.name, slug: event.project.slug },
      }
    }

    if (event instanceof SmtpConnectorCreated) {
      return {
        organizationId: await this.#organizationIdForProject(event.connector.projectId),
        projectId: event.connector.projectId,
        actorUserId: event.actor.id,
        action: 'smtp_connector.created',
        entityType: 'smtp_connector',
        entityId: event.connector.id,
        metadata: { name: event.connector.name, host: event.connector.host },
      }
    }

    if (event instanceof SmtpConnectorUpdated) {
      return {
        organizationId: await this.#organizationIdForProject(event.connector.projectId),
        projectId: event.connector.projectId,
        actorUserId: event.actor.id,
        action: 'smtp_connector.updated',
        entityType: 'smtp_connector',
        entityId: event.connector.id,
        metadata: { name: event.connector.name, host: event.connector.host },
      }
    }

    if (event instanceof SmtpConnectorDeleted) {
      return {
        organizationId: await this.#organizationIdForProject(event.connector.projectId),
        projectId: event.connector.projectId,
        actorUserId: event.actor.id,
        action: 'smtp_connector.deleted',
        entityType: 'smtp_connector',
        entityId: event.connector.id,
        metadata: { name: event.connector.name, host: event.connector.host },
      }
    }

    if (event instanceof SmtpConnectorDefaultChanged) {
      return {
        organizationId: await this.#organizationIdForProject(event.connector.projectId),
        projectId: event.connector.projectId,
        actorUserId: event.actor.id,
        action: 'smtp_connector.default_changed',
        entityType: 'smtp_connector',
        entityId: event.connector.id,
        metadata: { name: event.connector.name },
      }
    }

    if (event instanceof EmailTemplateCreated) {
      return {
        organizationId: await this.#organizationIdForProject(event.template.projectId),
        projectId: event.template.projectId,
        actorUserId: event.actor.id,
        action: 'email_template.created',
        entityType: 'email_template',
        entityId: event.template.id,
        metadata: { name: event.template.name },
      }
    }

    if (event instanceof EmailTemplateUpdated) {
      return {
        organizationId: await this.#organizationIdForProject(event.template.projectId),
        projectId: event.template.projectId,
        actorUserId: event.actor.id,
        action: 'email_template.updated',
        entityType: 'email_template',
        entityId: event.template.id,
        metadata: { name: event.template.name },
      }
    }

    if (event instanceof EmailTemplateDeleted) {
      return {
        organizationId: await this.#organizationIdForProject(event.template.projectId),
        projectId: event.template.projectId,
        actorUserId: event.actor.id,
        action: 'email_template.deleted',
        entityType: 'email_template',
        entityId: event.template.id,
        metadata: { name: event.template.name },
      }
    }

    if (event instanceof EmailLayoutCreated) {
      return {
        organizationId: await this.#organizationIdForProject(event.layout.projectId),
        projectId: event.layout.projectId,
        actorUserId: event.actor.id,
        action: 'email_layout.created',
        entityType: 'email_layout',
        entityId: event.layout.id,
        metadata: { name: event.layout.name },
      }
    }

    if (event instanceof EmailLayoutUpdated) {
      return {
        organizationId: await this.#organizationIdForProject(event.layout.projectId),
        projectId: event.layout.projectId,
        actorUserId: event.actor.id,
        action: 'email_layout.updated',
        entityType: 'email_layout',
        entityId: event.layout.id,
        metadata: { name: event.layout.name },
      }
    }

    if (event instanceof EmailLayoutDeleted) {
      return {
        organizationId: await this.#organizationIdForProject(event.layout.projectId),
        projectId: event.layout.projectId,
        actorUserId: event.actor.id,
        action: 'email_layout.deleted',
        entityType: 'email_layout',
        entityId: event.layout.id,
        metadata: { name: event.layout.name },
      }
    }

    if (event instanceof EmailCreated) {
      return {
        organizationId: await this.#organizationIdForProject(event.email.projectId),
        projectId: event.email.projectId,
        actorUserId: event.actor.id,
        action: 'email.created',
        entityType: 'email',
        entityId: event.email.id,
        metadata: { name: event.email.name },
      }
    }

    if (event instanceof EmailUpdated) {
      return {
        organizationId: await this.#organizationIdForProject(event.email.projectId),
        projectId: event.email.projectId,
        actorUserId: event.actor.id,
        action: 'email.updated',
        entityType: 'email',
        entityId: event.email.id,
        metadata: { name: event.email.name },
      }
    }

    if (event instanceof EmailDeleted) {
      return {
        organizationId: await this.#organizationIdForProject(event.email.projectId),
        projectId: event.email.projectId,
        actorUserId: event.actor.id,
        action: 'email.deleted',
        entityType: 'email',
        entityId: event.email.id,
        metadata: { name: event.email.name },
      }
    }

    if (event instanceof EmailPublished) {
      return {
        organizationId: await this.#organizationIdForProject(event.email.projectId),
        projectId: event.email.projectId,
        actorUserId: event.actor.id,
        action: 'email.published',
        entityType: 'email',
        entityId: event.email.id,
        metadata: { name: event.email.name },
      }
    }

    if (event instanceof CampaignActivated) {
      return {
        organizationId: await this.#organizationIdForProject(event.campaign.projectId),
        projectId: event.campaign.projectId,
        actorUserId: event.actor.id,
        action: 'campaign.activated',
        entityType: 'campaign',
        entityId: event.campaign.id,
        metadata: { name: event.campaign.name },
      }
    }

    if (event instanceof CampaignPaused) {
      return {
        organizationId: await this.#organizationIdForProject(event.campaign.projectId),
        projectId: event.campaign.projectId,
        actorUserId: event.actor.id,
        action: 'campaign.paused',
        entityType: 'campaign',
        entityId: event.campaign.id,
        metadata: { name: event.campaign.name },
      }
    }

    if (event instanceof CampaignResumed) {
      return {
        organizationId: await this.#organizationIdForProject(event.campaign.projectId),
        projectId: event.campaign.projectId,
        actorUserId: event.actor.id,
        action: 'campaign.resumed',
        entityType: 'campaign',
        entityId: event.campaign.id,
        metadata: { name: event.campaign.name },
      }
    }

    if (event instanceof CampaignArchived) {
      return {
        organizationId: await this.#organizationIdForProject(event.campaign.projectId),
        projectId: event.campaign.projectId,
        actorUserId: event.actor.id,
        action: 'campaign.archived',
        entityType: 'campaign',
        entityId: event.campaign.id,
        metadata: { name: event.campaign.name },
      }
    }

    if (event instanceof CampaignVersionPublished) {
      return {
        organizationId: await this.#organizationIdForProject(event.campaign.projectId),
        projectId: event.campaign.projectId,
        actorUserId: event.actor.id,
        action: 'campaign.version_published',
        entityType: 'campaign_version',
        entityId: event.version.id,
        metadata: { campaignId: event.campaign.id, versionNumber: event.version.versionNumber },
      }
    }

    if (event instanceof CampaignExecutionCompleted) {
      const context = await this.#resolveEnrollmentContext(event.enrollmentId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'campaign_execution.completed',
        entityType: 'campaign_execution',
        entityId: event.executionId,
        metadata: { enrollmentId: event.enrollmentId },
      }
    }

    if (event instanceof CampaignExecutionCancelled) {
      const context = await this.#resolveEnrollmentContext(event.enrollmentId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'campaign_execution.cancelled',
        entityType: 'campaign_execution',
        entityId: event.executionId,
        metadata: { enrollmentId: event.enrollmentId, reason: event.reason },
      }
    }

    if (event instanceof CampaignExecutionFailed) {
      const context = await this.#resolveEnrollmentContext(event.enrollmentId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'campaign_execution.failed',
        entityType: 'campaign_execution',
        entityId: event.executionId,
        metadata: { enrollmentId: event.enrollmentId, reason: event.reason },
      }
    }

    if (event instanceof CampaignEnrollmentCreated) {
      const context = await this.#resolveEnrollmentContext(event.enrollmentId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'campaign_enrollment.created',
        entityType: 'campaign_enrollment',
        entityId: event.enrollmentId,
        metadata: {
          campaignId: event.campaignId,
          contactId: event.contactId,
          source: event.source,
        },
      }
    }

    if (event instanceof EmailDelivered) {
      const context = await this.#resolveDeliveryContext(event.deliveryId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'email.delivered',
        entityType: 'email_delivery',
        entityId: event.deliveryId,
        metadata: { contactId: event.contactId },
      }
    }

    if (event instanceof EmailBounced) {
      const context = await this.#resolveDeliveryContext(event.deliveryId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'email.bounced',
        entityType: 'email_delivery',
        entityId: event.deliveryId,
        metadata: { contactId: event.contactId, bounceType: event.bounceType },
      }
    }

    if (event instanceof EmailComplained) {
      const context = await this.#resolveDeliveryContext(event.deliveryId)
      if (!context) return null
      return {
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: null,
        action: 'email.complained',
        entityType: 'email_delivery',
        entityId: event.deliveryId,
        metadata: { contactId: event.contactId },
      }
    }

    if (event instanceof ContactUnsubscribed) {
      return {
        organizationId: await this.#organizationIdForProject(event.projectId),
        projectId: event.projectId,
        actorUserId: null,
        action: 'contact.unsubscribed',
        entityType: 'contact',
        entityId: event.contactId,
        metadata: { source: event.source, campaignId: event.campaignId ?? null },
      }
    }

    if (event instanceof ContactResubscribed) {
      return {
        organizationId: await this.#organizationIdForProject(event.projectId),
        projectId: event.projectId,
        actorUserId: event.actorUserId,
        action: 'contact.resubscribed',
        entityType: 'contact',
        entityId: event.contactId,
        metadata: {},
      }
    }

    return null
  }
}
