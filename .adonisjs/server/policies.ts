export const policies = {
  CampaignPolicy: () => import('#policies/campaign_policy'),
  ContactPolicy: () => import('#policies/contact_policy'),
  CustomFieldDefinitionPolicy: () => import('#policies/custom_field_definition_policy'),
  EmailLayoutPolicy: () => import('#policies/email_layout_policy'),
  EmailPolicy: () => import('#policies/email_policy'),
  EmailTemplatePolicy: () => import('#policies/email_template_policy'),
  ObservabilityPolicy: () => import('#policies/observability_policy'),
  OrganizationPolicy: () => import('#policies/organization_policy'),
  ProjectPolicy: () => import('#policies/project_policy'),
  SegmentPolicy: () => import('#policies/segment_policy'),
  SmtpConnectorPolicy: () => import('#policies/smtp_connector_policy'),
  TagPolicy: () => import('#policies/tag_policy'),
}

