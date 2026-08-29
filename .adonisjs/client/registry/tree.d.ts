/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  home: typeof routes['home']
  tracking: {
    open: typeof routes['tracking.open']
    click: typeof routes['tracking.click']
  }
  smtpWebhooks: {
    handle: typeof routes['smtp_webhooks.handle']
  }
  unsubscribe: {
    show: typeof routes['unsubscribe.show']
  }
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
  }
  organizations: {
    index: typeof routes['organizations.index']
    create: typeof routes['organizations.create']
    store: typeof routes['organizations.store']
    show: typeof routes['organizations.show']
    update: typeof routes['organizations.update']
    destroy: typeof routes['organizations.destroy']
    switch: typeof routes['organizations.switch']
  }
  organizationMembers: {
    index: typeof routes['organization_members.index']
    update: typeof routes['organization_members.update']
    destroy: typeof routes['organization_members.destroy']
  }
  organizationInvitations: {
    store: typeof routes['organization_invitations.store']
    destroy: typeof routes['organization_invitations.destroy']
  }
  projects: {
    index: typeof routes['projects.index']
    create: typeof routes['projects.create']
    store: typeof routes['projects.store']
    show: typeof routes['projects.show']
    settings: typeof routes['projects.settings']
    update: typeof routes['projects.update']
    destroy: typeof routes['projects.destroy']
    switch: typeof routes['projects.switch']
  }
  contacts: {
    index: typeof routes['contacts.index']
    create: typeof routes['contacts.create']
    store: typeof routes['contacts.store']
    show: typeof routes['contacts.show']
    edit: typeof routes['contacts.edit']
    update: typeof routes['contacts.update']
    destroy: typeof routes['contacts.destroy']
    tags: {
      attach: typeof routes['contacts.tags.attach']
      detach: typeof routes['contacts.tags.detach']
    }
    unsubscribe: typeof routes['contacts.unsubscribe']
    resubscribe: typeof routes['contacts.resubscribe']
    history: typeof routes['contacts.history']
  }
  smtpConnectors: {
    index: typeof routes['smtp_connectors.index']
    create: typeof routes['smtp_connectors.create']
    store: typeof routes['smtp_connectors.store']
    test: typeof routes['smtp_connectors.test']
    edit: typeof routes['smtp_connectors.edit']
    update: typeof routes['smtp_connectors.update']
    destroy: typeof routes['smtp_connectors.destroy']
    setDefault: typeof routes['smtp_connectors.setDefault']
    toggleEnabled: typeof routes['smtp_connectors.toggleEnabled']
    testExisting: typeof routes['smtp_connectors.testExisting']
  }
  customFieldDefinitions: {
    index: typeof routes['custom_field_definitions.index']
    create: typeof routes['custom_field_definitions.create']
    store: typeof routes['custom_field_definitions.store']
    edit: typeof routes['custom_field_definitions.edit']
    update: typeof routes['custom_field_definitions.update']
    destroy: typeof routes['custom_field_definitions.destroy']
  }
  tags: {
    index: typeof routes['tags.index']
    store: typeof routes['tags.store']
    edit: typeof routes['tags.edit']
    update: typeof routes['tags.update']
    destroy: typeof routes['tags.destroy']
  }
  apiKeys: {
    index: typeof routes['api_keys.index']
    store: typeof routes['api_keys.store']
    destroy: typeof routes['api_keys.destroy']
  }
  emailTemplates: {
    index: typeof routes['email_templates.index']
    create: typeof routes['email_templates.create']
    store: typeof routes['email_templates.store']
    edit: typeof routes['email_templates.edit']
    update: typeof routes['email_templates.update']
    destroy: typeof routes['email_templates.destroy']
    duplicate: typeof routes['email_templates.duplicate']
    preview: typeof routes['email_templates.preview']
  }
  emailLayouts: {
    index: typeof routes['email_layouts.index']
    create: typeof routes['email_layouts.create']
    store: typeof routes['email_layouts.store']
    edit: typeof routes['email_layouts.edit']
    update: typeof routes['email_layouts.update']
    destroy: typeof routes['email_layouts.destroy']
    duplicate: typeof routes['email_layouts.duplicate']
    preview: typeof routes['email_layouts.preview']
  }
  emails: {
    index: typeof routes['emails.index']
    create: typeof routes['emails.create']
    store: typeof routes['emails.store']
    edit: typeof routes['emails.edit']
    update: typeof routes['emails.update']
    destroy: typeof routes['emails.destroy']
    duplicate: typeof routes['emails.duplicate']
    translate: typeof routes['emails.translate']
    publish: typeof routes['emails.publish']
    preview: typeof routes['emails.preview']
    sendTest: typeof routes['emails.sendTest']
  }
  segments: {
    index: typeof routes['segments.index']
    create: typeof routes['segments.create']
    store: typeof routes['segments.store']
    preview: typeof routes['segments.preview']
    show: typeof routes['segments.show']
    edit: typeof routes['segments.edit']
    update: typeof routes['segments.update']
    destroy: typeof routes['segments.destroy']
    recompute: typeof routes['segments.recompute']
  }
  campaigns: {
    index: typeof routes['campaigns.index']
    create: typeof routes['campaigns.create']
    store: typeof routes['campaigns.store']
    show: typeof routes['campaigns.show']
    update: typeof routes['campaigns.update']
    duplicate: typeof routes['campaigns.duplicate']
    activate: typeof routes['campaigns.activate']
    pause: typeof routes['campaigns.pause']
    resume: typeof routes['campaigns.resume']
    archive: typeof routes['campaigns.archive']
    builder: {
      show: typeof routes['campaigns.builder.show']
      save: typeof routes['campaigns.builder.save']
    }
    versions: {
      show: typeof routes['campaigns.versions.show']
      restore: typeof routes['campaigns.versions.restore']
      destroy: typeof routes['campaigns.versions.destroy']
    }
  }
  statistics: {
    dashboard: typeof routes['statistics.dashboard']
    campaign: typeof routes['statistics.campaign']
    campaignNode: typeof routes['statistics.campaignNode']
  }
  auditLog: {
    index: typeof routes['audit_log.index']
  }
  failedJobs: {
    index: typeof routes['failed_jobs.index']
    retry: typeof routes['failed_jobs.retry']
  }
  invitations: {
    show: typeof routes['invitations.show']
    accept: typeof routes['invitations.accept']
    decline: typeof routes['invitations.decline']
  }
  api: {
    contacts: {
      index: typeof routes['api.contacts.index']
      store: typeof routes['api.contacts.store']
      show: typeof routes['api.contacts.show']
      update: typeof routes['api.contacts.update']
      destroy: typeof routes['api.contacts.destroy']
      tags: {
        attach: typeof routes['api.contacts.tags.attach']
        detach: typeof routes['api.contacts.tags.detach']
      }
    }
  }
}
