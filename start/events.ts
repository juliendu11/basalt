/*
|--------------------------------------------------------------------------
| Internal event listeners
|--------------------------------------------------------------------------
|
| Registers listeners for the internal event bus (docs/plans/01-architecture.md
| § Event bus interne). Each domain adds its own `emitter.listen(...)` calls
| here as it is implemented.
|
*/

import emitter from '@adonisjs/core/services/emitter'
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
import ContactCreated from '#events/contact_created'
import ContactUpdated from '#events/contact_updated'
import CampaignActivated from '#events/campaign_activated'
import CampaignPaused from '#events/campaign_paused'
import CampaignResumed from '#events/campaign_resumed'
import CampaignArchived from '#events/campaign_archived'
import CampaignVersionPublished from '#events/campaign_version_published'
import CampaignExecutionCompleted from '#events/campaign_execution_completed'
import CampaignExecutionCancelled from '#events/campaign_execution_cancelled'
import CampaignExecutionFailed from '#events/campaign_execution_failed'
import SegmentMembershipAdded from '#events/segment_membership_added'
import CampaignEnrollmentCreated from '#events/campaign_enrollment_created'
import EmailDelivered from '#events/email_delivered'
import EmailBounced from '#events/email_bounced'
import EmailComplained from '#events/email_complained'
import ContactUnsubscribed from '#events/contact_unsubscribed'
import ContactResubscribed from '#events/contact_resubscribed'
import logger from '@adonisjs/core/services/logger'
import hrTime from 'pretty-hrtime'

emitter.listen(OrganizationMemberInvited, [
  () => import('#listeners/write_audit_log'),
  () => import('#listeners/send_organization_invitation_email'),
])
emitter.listen(OrganizationMemberJoined, [() => import('#listeners/write_audit_log')])
emitter.listen(OrganizationMemberRemoved, [() => import('#listeners/write_audit_log')])
emitter.listen(OrganizationOwnershipTransferred, [() => import('#listeners/write_audit_log')])
emitter.listen(ProjectCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(ProjectDeleted, [() => import('#listeners/write_audit_log')])
emitter.listen(SmtpConnectorCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(SmtpConnectorUpdated, [() => import('#listeners/write_audit_log')])
emitter.listen(SmtpConnectorDeleted, [() => import('#listeners/write_audit_log')])
emitter.listen(SmtpConnectorDefaultChanged, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailTemplateCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailTemplateUpdated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailTemplateDeleted, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailLayoutCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailLayoutUpdated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailLayoutDeleted, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailUpdated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailDeleted, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailPublished, [() => import('#listeners/write_audit_log')])
emitter.listen(ContactCreated, [() => import('#listeners/recompute_segments_on_contact_change')])
emitter.listen(ContactUpdated, [() => import('#listeners/recompute_segments_on_contact_change')])
emitter.listen(CampaignActivated, [
  () => import('#listeners/write_audit_log'),
  () => import('#listeners/enroll_existing_segment_members_on_campaign_activated'),
])
emitter.listen(CampaignPaused, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignResumed, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignArchived, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignVersionPublished, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignExecutionCompleted, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignExecutionCancelled, [() => import('#listeners/write_audit_log')])
emitter.listen(CampaignExecutionFailed, [() => import('#listeners/write_audit_log')])
emitter.listen(SegmentMembershipAdded, [
  () => import('#listeners/enroll_contacts_on_segment_membership_added'),
])
emitter.listen(CampaignEnrollmentCreated, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailDelivered, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailBounced, [() => import('#listeners/write_audit_log')])
emitter.listen(EmailComplained, [() => import('#listeners/write_audit_log')])
emitter.listen(ContactUnsubscribed, [() => import('#listeners/write_audit_log')])
emitter.listen(ContactResubscribed, [() => import('#listeners/write_audit_log')])

emitter.on('db:connection:error', function (err) {
  logger.error(err)
})

emitter.on('db:query', function (query) {
  if (query.duration) {
    logger.debug(`mysql: (${hrTime(query.duration)}) ${query.sql} - [${query.bindings}]`)
  } else {
    logger.debug(`mysql: ${query.sql} - [${query.bindings}]`)
  }
})
