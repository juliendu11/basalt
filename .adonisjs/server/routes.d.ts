import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'tracking.open': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'tracking.click': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'smtp_webhooks.handle': { paramsTuple: [ParamValue]; params: {'connectorId': ParamValue} }
    'unsubscribe.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'organizations.index': { paramsTuple?: []; params?: {} }
    'organizations.create': { paramsTuple?: []; params?: {} }
    'organizations.store': { paramsTuple?: []; params?: {} }
    'organizations.show': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organizations.update': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organizations.destroy': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organizations.switch': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'membershipId': ParamValue} }
    'organization_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'membershipId': ParamValue} }
    'organization_invitations.store': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_invitations.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'invitationId': ParamValue} }
    'projects.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.create': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.store': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.show': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.settings': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.update': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.switch': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.tags.attach': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.tags.detach': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue,'tagId': ParamValue} }
    'contacts.unsubscribe': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.resubscribe': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'smtp_connectors.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.test': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.setDefault': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.toggleEnabled': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.testExisting': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'custom_field_definitions.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'custom_field_definitions.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'tags.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'tags.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'tags.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'tags.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'tags.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'api_keys.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'api_keys.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'api_keys.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'apiKeyId': ParamValue} }
    'email_templates.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_templates.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_templates.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_templates.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_templates.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'email_layouts.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'email_layouts.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'email_layouts.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'email_layouts.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.translate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.publish': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.sendTest': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.preview': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.recompute': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.activate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.pause': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.resume': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.archive': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.builder.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.builder.save': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.versions.show': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'campaigns.versions.restore': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'campaigns.versions.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'statistics.dashboard': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'statistics.campaign': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'statistics.campaignNode': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'nodeId': ParamValue} }
    'audit_log.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.history': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'failed_jobs.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'failed_jobs.retry': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'queue': ParamValue,'jobId': ParamValue} }
    'invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'invitations.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'invitations.decline': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'api.contacts.index': { paramsTuple?: []; params?: {} }
    'api.contacts.store': { paramsTuple?: []; params?: {} }
    'api.contacts.show': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
    'api.contacts.update': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
    'api.contacts.destroy': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
    'api.contacts.tags.attach': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
    'api.contacts.tags.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'contactId': ParamValue,'tagId': ParamValue} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'tracking.open': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'tracking.click': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'unsubscribe.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'organizations.index': { paramsTuple?: []; params?: {} }
    'organizations.create': { paramsTuple?: []; params?: {} }
    'organizations.show': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.create': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.show': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.settings': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'smtp_connectors.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'tags.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'tags.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'api_keys.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.builder.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.versions.show': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'statistics.dashboard': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'statistics.campaign': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'statistics.campaignNode': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'nodeId': ParamValue} }
    'audit_log.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.history': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'failed_jobs.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'api.contacts.index': { paramsTuple?: []; params?: {} }
    'api.contacts.show': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'tracking.open': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'tracking.click': { paramsTuple: [ParamValue]; params: {'deliveryToken': ParamValue} }
    'unsubscribe.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'organizations.index': { paramsTuple?: []; params?: {} }
    'organizations.create': { paramsTuple?: []; params?: {} }
    'organizations.show': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.index': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.create': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.show': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'projects.settings': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'smtp_connectors.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'custom_field_definitions.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'tags.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'tags.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'api_keys.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'segments.edit': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.create': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.builder.show': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.versions.show': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'statistics.dashboard': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'statistics.campaign': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'statistics.campaignNode': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'nodeId': ParamValue} }
    'audit_log.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.history': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'failed_jobs.index': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'api.contacts.index': { paramsTuple?: []; params?: {} }
    'api.contacts.show': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
  }
  POST: {
    'smtp_webhooks.handle': { paramsTuple: [ParamValue]; params: {'connectorId': ParamValue} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'organizations.store': { paramsTuple?: []; params?: {} }
    'organizations.switch': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_invitations.store': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.store': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'projects.switch': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.tags.attach': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.unsubscribe': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.resubscribe': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'smtp_connectors.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.test': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'smtp_connectors.setDefault': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.toggleEnabled': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'smtp_connectors.testExisting': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'tags.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'api_keys.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_templates.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_templates.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'email_layouts.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'email_layouts.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'emails.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.translate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.publish': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.preview': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'emails.sendTest': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.preview': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'segments.recompute': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.store': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'campaigns.duplicate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.activate': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.pause': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.resume': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.archive': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'campaigns.versions.restore': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'failed_jobs.retry': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'queue': ParamValue,'jobId': ParamValue} }
    'invitations.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'invitations.decline': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'api.contacts.store': { paramsTuple?: []; params?: {} }
    'api.contacts.tags.attach': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
  }
  PATCH: {
    'organizations.update': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'membershipId': ParamValue} }
    'projects.update': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'smtp_connectors.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'tags.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'email_templates.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.update': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
    'api.contacts.update': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
  }
  DELETE: {
    'organizations.destroy': { paramsTuple: [ParamValue]; params: {'organizationId': ParamValue} }
    'organization_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'membershipId': ParamValue} }
    'organization_invitations.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'invitationId': ParamValue} }
    'projects.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue} }
    'contacts.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue} }
    'contacts.tags.detach': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'contactId': ParamValue,'tagId': ParamValue} }
    'smtp_connectors.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'connectorId': ParamValue} }
    'custom_field_definitions.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'customFieldDefinitionId': ParamValue} }
    'tags.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'tagId': ParamValue} }
    'api_keys.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'apiKeyId': ParamValue} }
    'email_templates.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'templateId': ParamValue} }
    'email_layouts.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'layoutId': ParamValue} }
    'emails.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'emailId': ParamValue} }
    'segments.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'segmentId': ParamValue} }
    'campaigns.versions.destroy': { paramsTuple: [ParamValue,ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue,'versionId': ParamValue} }
    'api.contacts.destroy': { paramsTuple: [ParamValue]; params: {'contactId': ParamValue} }
    'api.contacts.tags.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'contactId': ParamValue,'tagId': ParamValue} }
  }
  PUT: {
    'campaigns.builder.save': { paramsTuple: [ParamValue,ParamValue,ParamValue]; params: {'organizationId': ParamValue,'projectId': ParamValue,'campaignId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}