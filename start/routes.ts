/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { apiThrottle } from '#start/limiter'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.get('/', [controllers.Home, 'index']).as('home')

/**
 * Deliberately PUBLIC — no `middleware.auth()`/`middleware.guest()`, no
 * organization/project prefix (docs/plans/16-email-tracking.md § Routes):
 * these are hit by recipients' email clients and SMTP providers, never by
 * an app user's authenticated browser session. Security is entirely
 * token/signature-based (see `TrackingController`/`SmtpWebhooksController`),
 * not session-based — see `config/shield.ts`'s `csrf.exceptRoutes` for the
 * matching CSRF exemption on the POST webhook route.
 */
router
  .get('/track/open/:deliveryToken.gif', [controllers.tracking.Tracking, 'open'])
  .as('tracking.open')
router
  .get('/track/click/:deliveryToken', [controllers.tracking.Tracking, 'click'])
  .as('tracking.click')
router
  .post('/webhooks/smtp/:connectorId', [controllers.tracking.SmtpWebhooks, 'handle'])
  .as('smtp_webhooks.handle')

/**
 * Also deliberately PUBLIC (docs/plans/17-unsubscribe.md § Routes) — a
 * global route, not nested under an organization/project prefix, since the
 * visitor clicking this link is unauthenticated and doesn't know either.
 * GET-only, so no CSRF exemption is needed (`config/shield.ts`'s CSRF check
 * only guards the state-changing verbs listed in its `methods` array).
 */
router.get('/unsubscribe/:token', [controllers.Unsubscribe, 'show']).as('unsubscribe.show')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create']).as('session.create')
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.post('logout', [controllers.Session, 'destroy'])

    router
      .group(() => {
        router
          .get('/', [controllers.organizations.Organizations, 'index'])
          .as('organizations.index')
        router
          .get('/create', [controllers.organizations.Organizations, 'create'])
          .as('organizations.create')
        router
          .post('/', [controllers.organizations.Organizations, 'store'])
          .as('organizations.store')

        router
          .group(() => {
            router
              .get('/settings', [controllers.organizations.Organizations, 'show'])
              .as('organizations.show')
            router
              .patch('/', [controllers.organizations.Organizations, 'update'])
              .as('organizations.update')
            router
              .delete('/', [controllers.organizations.Organizations, 'destroy'])
              .as('organizations.destroy')
            router
              .post('/switch', [controllers.organizations.Organizations, 'switch'])
              .as('organizations.switch')

            router
              .get('/members', [controllers.organizations.OrganizationMembers, 'index'])
              .as('organization_members.index')
            router
              .patch('/members/:membershipId', [
                controllers.organizations.OrganizationMembers,
                'update',
              ])
              .as('organization_members.update')
            router
              .delete('/members/:membershipId', [
                controllers.organizations.OrganizationMembers,
                'destroy',
              ])
              .as('organization_members.destroy')

            router
              .post('/members/invitations', [
                controllers.organizations.OrganizationInvitations,
                'store',
              ])
              .as('organization_invitations.store')
            router
              .delete('/members/invitations/:invitationId', [
                controllers.organizations.OrganizationInvitations,
                'destroy',
              ])
              .as('organization_invitations.destroy')

            router.get('/projects', [controllers.projects.Projects, 'index']).as('projects.index')
            router
              .get('/projects/create', [controllers.projects.Projects, 'create'])
              .as('projects.create')
            router.post('/projects', [controllers.projects.Projects, 'store']).as('projects.store')

            router
              .group(() => {
                router.get('/', [controllers.projects.Projects, 'show']).as('projects.show')
                router
                  .get('/settings', [controllers.projects.Projects, 'settings'])
                  .as('projects.settings')
                router.patch('/', [controllers.projects.Projects, 'update']).as('projects.update')
                router
                  .delete('/', [controllers.projects.Projects, 'destroy'])
                  .as('projects.destroy')
                router
                  .post('/switch', [controllers.projects.Projects, 'switch'])
                  .as('projects.switch')

                router
                  .get('/contacts', [controllers.contacts.Contacts, 'index'])
                  .as('contacts.index')
                router
                  .get('/contacts/create', [controllers.contacts.Contacts, 'create'])
                  .as('contacts.create')
                router
                  .post('/contacts', [controllers.contacts.Contacts, 'store'])
                  .as('contacts.store')
                router
                  .get('/contacts/:contactId', [controllers.contacts.Contacts, 'show'])
                  .as('contacts.show')
                router
                  .get('/contacts/:contactId/edit', [controllers.contacts.Contacts, 'edit'])
                  .as('contacts.edit')
                router
                  .patch('/contacts/:contactId', [controllers.contacts.Contacts, 'update'])
                  .as('contacts.update')
                router
                  .delete('/contacts/:contactId', [controllers.contacts.Contacts, 'destroy'])
                  .as('contacts.destroy')
                router
                  .post('/contacts/:contactId/tags', [controllers.contacts.ContactTags, 'attach'])
                  .as('contacts.tags.attach')
                router
                  .delete('/contacts/:contactId/tags/:tagId', [
                    controllers.contacts.ContactTags,
                    'detach',
                  ])
                  .as('contacts.tags.detach')
                router
                  .post('/contacts/:contactId/unsubscribe', [
                    controllers.contacts.Contacts,
                    'unsubscribe',
                  ])
                  .as('contacts.unsubscribe')
                router
                  .post('/contacts/:contactId/resubscribe', [
                    controllers.contacts.Contacts,
                    'resubscribe',
                  ])
                  .as('contacts.resubscribe')

                router
                  .get('/settings/smtp', [controllers.smtpConnectors.SmtpConnectors, 'index'])
                  .as('smtp_connectors.index')
                router
                  .get('/settings/smtp/create', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'create',
                  ])
                  .as('smtp_connectors.create')
                router
                  .post('/settings/smtp', [controllers.smtpConnectors.SmtpConnectors, 'store'])
                  .as('smtp_connectors.store')
                router
                  .post('/settings/smtp/test', [
                    controllers.smtpConnectors.SmtpConnectorTests,
                    'test',
                  ])
                  .as('smtp_connectors.test')
                router
                  .get('/settings/smtp/:connectorId/edit', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'edit',
                  ])
                  .as('smtp_connectors.edit')
                router
                  .patch('/settings/smtp/:connectorId', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'update',
                  ])
                  .as('smtp_connectors.update')
                router
                  .delete('/settings/smtp/:connectorId', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'destroy',
                  ])
                  .as('smtp_connectors.destroy')
                router
                  .post('/settings/smtp/:connectorId/default', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'setDefault',
                  ])
                  .as('smtp_connectors.setDefault')
                router
                  .post('/settings/smtp/:connectorId/toggle', [
                    controllers.smtpConnectors.SmtpConnectors,
                    'toggleEnabled',
                  ])
                  .as('smtp_connectors.toggleEnabled')
                router
                  .post('/settings/smtp/:connectorId/test', [
                    controllers.smtpConnectors.SmtpConnectorTests,
                    'testExisting',
                  ])
                  .as('smtp_connectors.testExisting')

                router
                  .get('/settings/custom-fields', [
                    controllers.customFields.CustomFieldDefinitions,
                    'index',
                  ])
                  .as('custom_field_definitions.index')
                router
                  .get('/settings/custom-fields/create', [
                    controllers.customFields.CustomFieldDefinitions,
                    'create',
                  ])
                  .as('custom_field_definitions.create')
                router
                  .post('/settings/custom-fields', [
                    controllers.customFields.CustomFieldDefinitions,
                    'store',
                  ])
                  .as('custom_field_definitions.store')
                router
                  .get('/settings/custom-fields/:customFieldDefinitionId/edit', [
                    controllers.customFields.CustomFieldDefinitions,
                    'edit',
                  ])
                  .as('custom_field_definitions.edit')
                router
                  .patch('/settings/custom-fields/:customFieldDefinitionId', [
                    controllers.customFields.CustomFieldDefinitions,
                    'update',
                  ])
                  .as('custom_field_definitions.update')
                router
                  .delete('/settings/custom-fields/:customFieldDefinitionId', [
                    controllers.customFields.CustomFieldDefinitions,
                    'destroy',
                  ])
                  .as('custom_field_definitions.destroy')

                router.get('/settings/tags', [controllers.tags.Tags, 'index']).as('tags.index')
                router.post('/settings/tags', [controllers.tags.Tags, 'store']).as('tags.store')
                router
                  .get('/settings/tags/:tagId/edit', [controllers.tags.Tags, 'edit'])
                  .as('tags.edit')
                router
                  .patch('/settings/tags/:tagId', [controllers.tags.Tags, 'update'])
                  .as('tags.update')
                router
                  .delete('/settings/tags/:tagId', [controllers.tags.Tags, 'destroy'])
                  .as('tags.destroy')

                router
                  .get('/settings/api-keys', [controllers.ApiKeys, 'index'])
                  .as('api_keys.index')
                router
                  .post('/settings/api-keys', [controllers.ApiKeys, 'store'])
                  .as('api_keys.store')
                router
                  .delete('/settings/api-keys/:apiKeyId', [controllers.ApiKeys, 'destroy'])
                  .as('api_keys.destroy')

                router
                  .get('/email-templates', [controllers.emailTemplates.EmailTemplates, 'index'])
                  .as('email_templates.index')
                router
                  .get('/email-templates/create', [
                    controllers.emailTemplates.EmailTemplates,
                    'create',
                  ])
                  .as('email_templates.create')
                router
                  .post('/email-templates', [controllers.emailTemplates.EmailTemplates, 'store'])
                  .as('email_templates.store')
                router
                  .get('/email-templates/:templateId/edit', [
                    controllers.emailTemplates.EmailTemplates,
                    'edit',
                  ])
                  .as('email_templates.edit')
                router
                  .patch('/email-templates/:templateId', [
                    controllers.emailTemplates.EmailTemplates,
                    'update',
                  ])
                  .as('email_templates.update')
                router
                  .delete('/email-templates/:templateId', [
                    controllers.emailTemplates.EmailTemplates,
                    'destroy',
                  ])
                  .as('email_templates.destroy')
                router
                  .post('/email-templates/:templateId/duplicate', [
                    controllers.emailTemplates.EmailTemplates,
                    'duplicate',
                  ])
                  .as('email_templates.duplicate')
                router
                  .post('/email-templates/:templateId/preview', [
                    controllers.emailTemplates.EmailTemplates,
                    'preview',
                  ])
                  .as('email_templates.preview')

                router
                  .get('/email-layouts', [controllers.emailLayouts.EmailLayouts, 'index'])
                  .as('email_layouts.index')
                router
                  .get('/email-layouts/create', [controllers.emailLayouts.EmailLayouts, 'create'])
                  .as('email_layouts.create')
                router
                  .post('/email-layouts', [controllers.emailLayouts.EmailLayouts, 'store'])
                  .as('email_layouts.store')
                router
                  .get('/email-layouts/:layoutId/edit', [
                    controllers.emailLayouts.EmailLayouts,
                    'edit',
                  ])
                  .as('email_layouts.edit')
                router
                  .patch('/email-layouts/:layoutId', [
                    controllers.emailLayouts.EmailLayouts,
                    'update',
                  ])
                  .as('email_layouts.update')
                router
                  .delete('/email-layouts/:layoutId', [
                    controllers.emailLayouts.EmailLayouts,
                    'destroy',
                  ])
                  .as('email_layouts.destroy')
                router
                  .post('/email-layouts/:layoutId/duplicate', [
                    controllers.emailLayouts.EmailLayouts,
                    'duplicate',
                  ])
                  .as('email_layouts.duplicate')
                router
                  .post('/email-layouts/:layoutId/preview', [
                    controllers.emailLayouts.EmailLayouts,
                    'preview',
                  ])
                  .as('email_layouts.preview')

                router.get('/emails', [controllers.emails.Emails, 'index']).as('emails.index')
                router
                  .get('/emails/create', [controllers.emails.Emails, 'create'])
                  .as('emails.create')
                router.post('/emails', [controllers.emails.Emails, 'store']).as('emails.store')
                router
                  .get('/emails/:emailId/edit', [controllers.emails.Emails, 'edit'])
                  .as('emails.edit')
                router
                  .patch('/emails/:emailId', [controllers.emails.Emails, 'update'])
                  .as('emails.update')
                router
                  .delete('/emails/:emailId', [controllers.emails.Emails, 'destroy'])
                  .as('emails.destroy')
                router
                  .post('/emails/:emailId/duplicate', [controllers.emails.Emails, 'duplicate'])
                  .as('emails.duplicate')
                router
                  .post('/emails/:emailId/translate', [controllers.emails.Emails, 'translate'])
                  .as('emails.translate')
                router
                  .post('/emails/:emailId/publish', [controllers.emails.Emails, 'publish'])
                  .as('emails.publish')
                router
                  .post('/emails/:emailId/preview', [controllers.emails.Emails, 'preview'])
                  .as('emails.preview')
                router
                  .post('/emails/:emailId/send-test', [controllers.emails.Emails, 'sendTest'])
                  .as('emails.sendTest')

                router
                  .get('/segments', [controllers.segments.Segments, 'index'])
                  .as('segments.index')
                router
                  .get('/segments/create', [controllers.segments.Segments, 'create'])
                  .as('segments.create')
                router
                  .post('/segments', [controllers.segments.Segments, 'store'])
                  .as('segments.store')
                router
                  .post('/segments/preview', [controllers.segments.SegmentPreviews, 'store'])
                  .as('segments.preview')
                router
                  .get('/segments/:segmentId', [controllers.segments.Segments, 'show'])
                  .as('segments.show')
                router
                  .get('/segments/:segmentId/edit', [controllers.segments.Segments, 'edit'])
                  .as('segments.edit')
                router
                  .patch('/segments/:segmentId', [controllers.segments.Segments, 'update'])
                  .as('segments.update')
                router
                  .delete('/segments/:segmentId', [controllers.segments.Segments, 'destroy'])
                  .as('segments.destroy')
                router
                  .post('/segments/:segmentId/recompute', [
                    controllers.segments.Segments,
                    'recompute',
                  ])
                  .as('segments.recompute')

                router
                  .get('/campaigns', [controllers.campaigns.Campaigns, 'index'])
                  .as('campaigns.index')
                router
                  .get('/campaigns/create', [controllers.campaigns.Campaigns, 'create'])
                  .as('campaigns.create')
                router
                  .post('/campaigns', [controllers.campaigns.Campaigns, 'store'])
                  .as('campaigns.store')
                router
                  .get('/campaigns/:campaignId', [controllers.campaigns.Campaigns, 'show'])
                  .as('campaigns.show')
                router
                  .get('/campaigns/:campaignId/upcoming', [
                    controllers.campaigns.Campaigns,
                    'upcoming',
                  ])
                  .as('campaigns.upcoming')
                router
                  .patch('/campaigns/:campaignId', [controllers.campaigns.Campaigns, 'update'])
                  .as('campaigns.update')
                router
                  .post('/campaigns/:campaignId/duplicate', [
                    controllers.campaigns.Campaigns,
                    'duplicate',
                  ])
                  .as('campaigns.duplicate')
                router
                  .post('/campaigns/:campaignId/activate', [
                    controllers.campaigns.Campaigns,
                    'activate',
                  ])
                  .as('campaigns.activate')
                router
                  .post('/campaigns/:campaignId/pause', [controllers.campaigns.Campaigns, 'pause'])
                  .as('campaigns.pause')
                router
                  .post('/campaigns/:campaignId/resume', [
                    controllers.campaigns.Campaigns,
                    'resume',
                  ])
                  .as('campaigns.resume')
                router
                  .post('/campaigns/:campaignId/archive', [
                    controllers.campaigns.Campaigns,
                    'archive',
                  ])
                  .as('campaigns.archive')
                router
                  .get('/campaigns/:campaignId/builder', [
                    controllers.campaigns.CampaignBuilders,
                    'show',
                  ])
                  .as('campaigns.builder.show')
                router
                  .put('/campaigns/:campaignId/builder', [
                    controllers.campaigns.CampaignBuilders,
                    'save',
                  ])
                  .as('campaigns.builder.save')
                router
                  .get('/campaigns/:campaignId/versions/:versionId', [
                    controllers.campaigns.CampaignVersions,
                    'show',
                  ])
                  .as('campaigns.versions.show')
                router
                  .post('/campaigns/:campaignId/versions/:versionId/restore', [
                    controllers.campaigns.CampaignVersions,
                    'restore',
                  ])
                  .as('campaigns.versions.restore')
                router
                  .delete('/campaigns/:campaignId/versions/:versionId', [
                    controllers.campaigns.CampaignVersions,
                    'destroy',
                  ])
                  .as('campaigns.versions.destroy')

                router
                  .get('/dashboard', [controllers.statistics.Statistics, 'dashboard'])
                  .as('statistics.dashboard')
                router
                  .get('/campaigns/:campaignId/statistics', [
                    controllers.statistics.Statistics,
                    'campaign',
                  ])
                  .as('statistics.campaign')
                router
                  .get('/campaigns/:campaignId/nodes/:nodeId/statistics', [
                    controllers.statistics.Statistics,
                    'campaignNode',
                  ])
                  .as('statistics.campaignNode')

                router
                  .get('/settings/audit-log', [controllers.audit.AuditLog, 'index'])
                  .as('audit_log.index')
                router
                  .get('/contacts/:contactId/history', [
                    controllers.contacts.ContactHistory,
                    'index',
                  ])
                  .as('contacts.history')
                router
                  .get('/settings/jobs', [controllers.jobs.FailedJobs, 'index'])
                  .as('failed_jobs.index')
                router
                  .post('/settings/jobs/:queue/:jobId/retry', [
                    controllers.jobs.FailedJobs,
                    'retry',
                  ])
                  .as('failed_jobs.retry')
              })
              .prefix('/projects/:projectId')
              .use(middleware.project())
          })
          .prefix('/:organizationId')
          .use(middleware.organization())
      })
      .prefix('/organizations')

    router.get('/invitations/:token', [controllers.Invitations, 'show']).as('invitations.show')
    router
      .post('/invitations/:token/accept', [controllers.Invitations, 'accept'])
      .as('invitations.accept')
    router
      .post('/invitations/:token/decline', [controllers.Invitations, 'decline'])
      .as('invitations.decline')
  })
  .use(middleware.auth())

/**
 * Public external API (docs/plans README: "API with authentication") —
 * authenticated per-project via `Authorization: Bearer <token>`
 * (`middleware.apiKeyAuth()`), never the session guard, so it sits outside
 * the `middleware.auth()` group above and carries no
 * `organizationId`/`projectId` in its paths — the key itself resolves
 * `ctx.project`.
 */
router
  .group(() => {
    router.get('/contacts', [controllers.api.v1.Contacts, 'index']).as('api.contacts.index')
    router.post('/contacts', [controllers.api.v1.Contacts, 'store']).as('api.contacts.store')
    router
      .get('/contacts/:contactId', [controllers.api.v1.Contacts, 'show'])
      .as('api.contacts.show')
    router
      .patch('/contacts/:contactId', [controllers.api.v1.Contacts, 'update'])
      .as('api.contacts.update')
    router
      .delete('/contacts/:contactId', [controllers.api.v1.Contacts, 'destroy'])
      .as('api.contacts.destroy')
    router
      .post('/contacts/:contactId/tags', [controllers.api.v1.ContactTags, 'attach'])
      .as('api.contacts.tags.attach')
    router
      .delete('/contacts/:contactId/tags/:tagId', [controllers.api.v1.ContactTags, 'detach'])
      .as('api.contacts.tags.detach')
  })
  .prefix('/api/v1')
  .use([middleware.apiKeyAuth(), apiThrottle])
