/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'home': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/home_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/home_controller').default['index']>>>
    }
  }
  'tracking.open': {
    methods: ["GET","HEAD"]
    pattern: '/track/open/:deliveryToken.gif'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { deliveryToken: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tracking/tracking_controller').default['open']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tracking/tracking_controller').default['open']>>>
    }
  }
  'tracking.click': {
    methods: ["GET","HEAD"]
    pattern: '/track/click/:deliveryToken'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { deliveryToken: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tracking/tracking_controller').default['click']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tracking/tracking_controller').default['click']>>>
    }
  }
  'smtp_webhooks.handle': {
    methods: ["POST"]
    pattern: '/webhooks/smtp/:connectorId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tracking/smtp_webhooks_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tracking/smtp_webhooks_controller').default['handle']>>>
    }
  }
  'unsubscribe.show': {
    methods: ["GET","HEAD"]
    pattern: '/unsubscribe/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/unsubscribe_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/unsubscribe_controller').default['show']>>>
    }
  }
  'new_account.create': {
    methods: ["GET","HEAD"]
    pattern: '/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
    }
  }
  'new_account.store': {
    methods: ["POST"]
    pattern: '/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'session.create': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
    }
  }
  'session.store': {
    methods: ["POST"]
    pattern: '/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'session.destroy': {
    methods: ["POST"]
    pattern: '/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
    }
  }
  'organizations.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['index']>>>
    }
  }
  'organizations.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/create'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['create']>>>
    }
  }
  'organizations.store': {
    methods: ["POST"]
    pattern: '/organizations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').createOrganizationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').createOrganizationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organizations.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/settings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['show']>>>
    }
  }
  'organizations.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').updateOrganizationValidator)>>
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').updateOrganizationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organizations.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['destroy']>>>
    }
  }
  'organizations.switch': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/switch'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['switch']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organizations_controller').default['switch']>>>
    }
  }
  'organization_members.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/members'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['index']>>>
    }
  }
  'organization_members.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/members/:membershipId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').changeRoleValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; membershipId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').changeRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_members.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/members/:membershipId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; membershipId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organization_members_controller').default['destroy']>>>
    }
  }
  'organization_invitations.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/members/invitations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').inviteMemberValidator)>>
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').inviteMemberValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organization_invitations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organization_invitations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_invitations.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/members/invitations/:invitationId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations/organization_invitations_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations/organization_invitations_controller').default['destroy']>>>
    }
  }
  'projects.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['index']>>>
    }
  }
  'projects.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/create'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['create']>>>
    }
  }
  'projects.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/project').createProjectValidator)>>
      paramsTuple: [ParamValue]
      params: { organizationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/project').createProjectValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['show']>>>
    }
  }
  'projects.settings': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['settings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['settings']>>>
    }
  }
  'projects.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/project').updateProjectValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/project').updateProjectValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['destroy']>>>
    }
  }
  'projects.switch': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/switch'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['switch']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/projects/projects_controller').default['switch']>>>
    }
  }
  'contacts.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['index']>>>
    }
  }
  'contacts.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['create']>>>
    }
  }
  'contacts.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['show']>>>
    }
  }
  'contacts.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['edit']>>>
    }
  }
  'contacts.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['destroy']>>>
    }
  }
  'contacts.tags.attach': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/tags'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contact_tags_controller').default['attach']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contact_tags_controller').default['attach']>>>
    }
  }
  'contacts.tags.detach': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/tags/:tagId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue; tagId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contact_tags_controller').default['detach']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contact_tags_controller').default['detach']>>>
    }
  }
  'contacts.unsubscribe': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/unsubscribe'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['unsubscribe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['unsubscribe']>>>
    }
  }
  'contacts.resubscribe': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/resubscribe'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['resubscribe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contacts_controller').default['resubscribe']>>>
    }
  }
  'smtp_connectors.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['index']>>>
    }
  }
  'smtp_connectors.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['create']>>>
    }
  }
  'smtp_connectors.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/smtp_connector').createSmtpConnectorValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/smtp_connector').createSmtpConnectorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'smtp_connectors.test': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/smtp_connector').testSmtpConnectionValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/smtp_connector').testSmtpConnectionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connector_tests_controller').default['test']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connector_tests_controller').default['test']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'smtp_connectors.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['edit']>>>
    }
  }
  'smtp_connectors.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/smtp_connector').updateSmtpConnectorValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/smtp_connector').updateSmtpConnectorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'smtp_connectors.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['destroy']>>>
    }
  }
  'smtp_connectors.setDefault': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId/default'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['setDefault']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['setDefault']>>>
    }
  }
  'smtp_connectors.toggleEnabled': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId/toggle'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['toggleEnabled']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connectors_controller').default['toggleEnabled']>>>
    }
  }
  'smtp_connectors.testExisting': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/smtp/:connectorId/test'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; connectorId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connector_tests_controller').default['testExisting']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/smtp_connectors/smtp_connector_tests_controller').default['testExisting']>>>
    }
  }
  'custom_field_definitions.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['index']>>>
    }
  }
  'custom_field_definitions.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['create']>>>
    }
  }
  'custom_field_definitions.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/custom_field_definition').createCustomFieldDefinitionValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/custom_field_definition').createCustomFieldDefinitionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'custom_field_definitions.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields/:customFieldDefinitionId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; customFieldDefinitionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['edit']>>>
    }
  }
  'custom_field_definitions.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields/:customFieldDefinitionId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/custom_field_definition').updateCustomFieldDefinitionValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; customFieldDefinitionId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/custom_field_definition').updateCustomFieldDefinitionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'custom_field_definitions.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/custom-fields/:customFieldDefinitionId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; customFieldDefinitionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/custom_fields/custom_field_definitions_controller').default['destroy']>>>
    }
  }
  'tags.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/tags'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['index']>>>
    }
  }
  'tags.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/tags'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').createTagValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').createTagValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/tags/:tagId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; tagId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['edit']>>>
    }
  }
  'tags.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/tags/:tagId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').updateTagValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; tagId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').updateTagValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/tags/:tagId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; tagId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags/tags_controller').default['destroy']>>>
    }
  }
  'api_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/api-keys'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
    }
  }
  'api_keys.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/api-keys'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/api_key').createApiKeyValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/api_key').createApiKeyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api_keys.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/api-keys/:apiKeyId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; apiKeyId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['destroy']>>>
    }
  }
  'email_templates.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['index']>>>
    }
  }
  'email_templates.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['create']>>>
    }
  }
  'email_templates.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email_template').createEmailTemplateValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email_template').createEmailTemplateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'email_templates.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/:templateId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; templateId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['edit']>>>
    }
  }
  'email_templates.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/:templateId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email_template').updateEmailTemplateValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; templateId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email_template').updateEmailTemplateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'email_templates.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/:templateId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; templateId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['destroy']>>>
    }
  }
  'email_templates.duplicate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/:templateId/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; templateId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['duplicate']>>>
    }
  }
  'email_templates.preview': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-templates/:templateId/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; templateId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_templates/email_templates_controller').default['preview']>>>
    }
  }
  'email_layouts.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['index']>>>
    }
  }
  'email_layouts.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['create']>>>
    }
  }
  'email_layouts.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email_layout').createEmailLayoutValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email_layout').createEmailLayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'email_layouts.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/:layoutId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; layoutId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['edit']>>>
    }
  }
  'email_layouts.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/:layoutId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email_layout').updateEmailLayoutValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; layoutId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email_layout').updateEmailLayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'email_layouts.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/:layoutId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; layoutId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['destroy']>>>
    }
  }
  'email_layouts.duplicate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/:layoutId/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; layoutId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['duplicate']>>>
    }
  }
  'email_layouts.preview': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/email-layouts/:layoutId/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; layoutId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_layouts/email_layouts_controller').default['preview']>>>
    }
  }
  'emails.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['index']>>>
    }
  }
  'emails.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['create']>>>
    }
  }
  'emails.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email').createEmailFromTemplateValidator)>|InferInput<(typeof import('#validators/email').createEmailFromLayoutValidator)>|InferInput<(typeof import('#validators/email').createEmailValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email').createEmailFromTemplateValidator)>|InferInput<(typeof import('#validators/email').createEmailFromLayoutValidator)>|InferInput<(typeof import('#validators/email').createEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'emails.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['edit']>>>
    }
  }
  'emails.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email').updateEmailFromLayoutValidator)>|InferInput<(typeof import('#validators/email').updateEmailValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email').updateEmailFromLayoutValidator)>|InferInput<(typeof import('#validators/email').updateEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'emails.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['destroy']>>>
    }
  }
  'emails.duplicate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['duplicate']>>>
    }
  }
  'emails.translate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/translate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email').translateEmailValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email').translateEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['translate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['translate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'emails.publish': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/publish'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['publish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['publish']>>>
    }
  }
  'emails.preview': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['preview']>>>
    }
  }
  'emails.sendTest': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/emails/:emailId/send-test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/email').sendTestEmailValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; emailId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/email').sendTestEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['sendTest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/emails/emails_controller').default['sendTest']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'segments.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['index']>>>
    }
  }
  'segments.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['create']>>>
    }
  }
  'segments.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/segment').createSegmentValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/segment').createSegmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'segments.preview': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/preview'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/segment').previewSegmentValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/segment').previewSegmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segment_previews_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segment_previews_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'segments.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/:segmentId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; segmentId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['show']>>>
    }
  }
  'segments.edit': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/:segmentId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; segmentId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['edit']>>>
    }
  }
  'segments.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/:segmentId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/segment').updateSegmentValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; segmentId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/segment').updateSegmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'segments.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/:segmentId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; segmentId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['destroy']>>>
    }
  }
  'segments.recompute': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/segments/:segmentId/recompute'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; segmentId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['recompute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/segments/segments_controller').default['recompute']>>>
    }
  }
  'campaigns.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['index']>>>
    }
  }
  'campaigns.create': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/create'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['create']>>>
    }
  }
  'campaigns.store': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').createCampaignValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').createCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['show']>>>
    }
  }
  'campaigns.upcoming': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/upcoming'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['upcoming']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['upcoming']>>>
    }
  }
  'campaigns.update': {
    methods: ["PATCH"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').updateCampaignValidator)>>
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').updateCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.duplicate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['duplicate']>>>
    }
  }
  'campaigns.activate': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/activate'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['activate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['activate']>>>
    }
  }
  'campaigns.pause': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/pause'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['pause']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['pause']>>>
    }
  }
  'campaigns.resume': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/resume'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['resume']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['resume']>>>
    }
  }
  'campaigns.archive': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaigns_controller').default['archive']>>>
    }
  }
  'campaigns.builder.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/builder'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_builders_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_builders_controller').default['show']>>>
    }
  }
  'campaigns.builder.save': {
    methods: ["PUT"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/builder'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_builders_controller').default['save']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_builders_controller').default['save']>>>
    }
  }
  'campaigns.versions.show': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/versions/:versionId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue; versionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['show']>>>
    }
  }
  'campaigns.versions.restore': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/versions/:versionId/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue; versionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['restore']>>>
    }
  }
  'campaigns.versions.destroy': {
    methods: ["DELETE"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/versions/:versionId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue; versionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns/campaign_versions_controller').default['destroy']>>>
    }
  }
  'statistics.dashboard': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/dashboard'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['dashboard']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['dashboard']>>>
    }
  }
  'statistics.campaign': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/statistics'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['campaign']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['campaign']>>>
    }
  }
  'statistics.campaignNode': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/campaigns/:campaignId/nodes/:nodeId/statistics'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; campaignId: ParamValue; nodeId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['campaignNode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/statistics/statistics_controller').default['campaignNode']>>>
    }
  }
  'audit_log.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/audit-log'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/audit/audit_log_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/audit/audit_log_controller').default['index']>>>
    }
  }
  'contacts.history': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/contacts/:contactId/history'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts/contact_history_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts/contact_history_controller').default['index']>>>
    }
  }
  'failed_jobs.index': {
    methods: ["GET","HEAD"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/jobs'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/jobs/failed_jobs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/jobs/failed_jobs_controller').default['index']>>>
    }
  }
  'failed_jobs.retry': {
    methods: ["POST"]
    pattern: '/organizations/:organizationId/projects/:projectId/settings/jobs/:queue/:jobId/retry'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { organizationId: ParamValue; projectId: ParamValue; queue: ParamValue; jobId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/jobs/failed_jobs_controller').default['retry']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/jobs/failed_jobs_controller').default['retry']>>>
    }
  }
  'invitations.show': {
    methods: ["GET","HEAD"]
    pattern: '/invitations/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['show']>>>
    }
  }
  'invitations.accept': {
    methods: ["POST"]
    pattern: '/invitations/:token/accept'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['accept']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['accept']>>>
    }
  }
  'invitations.decline': {
    methods: ["POST"]
    pattern: '/invitations/:token/decline'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['decline']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['decline']>>>
    }
  }
  'api.contacts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/contacts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['index']>>>
    }
  }
  'api.contacts.store': {
    methods: ["POST"]
    pattern: '/api/v1/contacts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.contacts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/contacts/:contactId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['show']>>>
    }
  }
  'api.contacts.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/contacts/:contactId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      paramsTuple: [ParamValue]
      params: { contactId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.contacts.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/contacts/:contactId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contacts_controller').default['destroy']>>>
    }
  }
  'api.contacts.tags.attach': {
    methods: ["POST"]
    pattern: '/api/v1/contacts/:contactId/tags'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { contactId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contact_tags_controller').default['attach']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contact_tags_controller').default['attach']>>>
    }
  }
  'api.contacts.tags.detach': {
    methods: ["DELETE"]
    pattern: '/api/v1/contacts/:contactId/tags/:tagId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { contactId: ParamValue; tagId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/contact_tags_controller').default['detach']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/contact_tags_controller').default['detach']>>>
    }
  }
}
