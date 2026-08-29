import '@adonisjs/inertia/types'

import type { VNodeProps, AllowedComponentProps, ComponentInstance } from 'vue'

type ExtractProps<T> = Omit<
  ComponentInstance<T>['$props'],
  keyof VNodeProps | keyof AllowedComponentProps
>

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.vue'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.vue'))['default']>
    'campaigns/builder': ExtractProps<(typeof import('../../inertia/pages/campaigns/builder.vue'))['default']>
    'campaigns/create': ExtractProps<(typeof import('../../inertia/pages/campaigns/create.vue'))['default']>
    'campaigns/index': ExtractProps<(typeof import('../../inertia/pages/campaigns/index.vue'))['default']>
    'campaigns/node_statistics': ExtractProps<(typeof import('../../inertia/pages/campaigns/node_statistics.vue'))['default']>
    'campaigns/show': ExtractProps<(typeof import('../../inertia/pages/campaigns/show.vue'))['default']>
    'campaigns/statistics': ExtractProps<(typeof import('../../inertia/pages/campaigns/statistics.vue'))['default']>
    'campaigns/upcoming': ExtractProps<(typeof import('../../inertia/pages/campaigns/upcoming.vue'))['default']>
    'campaigns/version': ExtractProps<(typeof import('../../inertia/pages/campaigns/version.vue'))['default']>
    'contacts/create': ExtractProps<(typeof import('../../inertia/pages/contacts/create.vue'))['default']>
    'contacts/edit': ExtractProps<(typeof import('../../inertia/pages/contacts/edit.vue'))['default']>
    'contacts/history': ExtractProps<(typeof import('../../inertia/pages/contacts/history.vue'))['default']>
    'contacts/index': ExtractProps<(typeof import('../../inertia/pages/contacts/index.vue'))['default']>
    'contacts/show': ExtractProps<(typeof import('../../inertia/pages/contacts/show.vue'))['default']>
    'dashboard/index': ExtractProps<(typeof import('../../inertia/pages/dashboard/index.vue'))['default']>
    'email_layouts/create': ExtractProps<(typeof import('../../inertia/pages/email_layouts/create.vue'))['default']>
    'email_layouts/edit': ExtractProps<(typeof import('../../inertia/pages/email_layouts/edit.vue'))['default']>
    'email_layouts/index': ExtractProps<(typeof import('../../inertia/pages/email_layouts/index.vue'))['default']>
    'email_templates/create': ExtractProps<(typeof import('../../inertia/pages/email_templates/create.vue'))['default']>
    'email_templates/edit': ExtractProps<(typeof import('../../inertia/pages/email_templates/edit.vue'))['default']>
    'email_templates/index': ExtractProps<(typeof import('../../inertia/pages/email_templates/index.vue'))['default']>
    'emails/create': ExtractProps<(typeof import('../../inertia/pages/emails/create.vue'))['default']>
    'emails/edit': ExtractProps<(typeof import('../../inertia/pages/emails/edit.vue'))['default']>
    'emails/index': ExtractProps<(typeof import('../../inertia/pages/emails/index.vue'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.vue'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.vue'))['default']>
    'invitations/show': ExtractProps<(typeof import('../../inertia/pages/invitations/show.vue'))['default']>
    'organizations/create': ExtractProps<(typeof import('../../inertia/pages/organizations/create.vue'))['default']>
    'organizations/index': ExtractProps<(typeof import('../../inertia/pages/organizations/index.vue'))['default']>
    'organizations/members/index': ExtractProps<(typeof import('../../inertia/pages/organizations/members/index.vue'))['default']>
    'organizations/show': ExtractProps<(typeof import('../../inertia/pages/organizations/show.vue'))['default']>
    'projects/create': ExtractProps<(typeof import('../../inertia/pages/projects/create.vue'))['default']>
    'projects/index': ExtractProps<(typeof import('../../inertia/pages/projects/index.vue'))['default']>
    'projects/settings': ExtractProps<(typeof import('../../inertia/pages/projects/settings.vue'))['default']>
    'projects/show': ExtractProps<(typeof import('../../inertia/pages/projects/show.vue'))['default']>
    'segments/create': ExtractProps<(typeof import('../../inertia/pages/segments/create.vue'))['default']>
    'segments/edit': ExtractProps<(typeof import('../../inertia/pages/segments/edit.vue'))['default']>
    'segments/index': ExtractProps<(typeof import('../../inertia/pages/segments/index.vue'))['default']>
    'segments/show': ExtractProps<(typeof import('../../inertia/pages/segments/show.vue'))['default']>
    'settings/api_keys/index': ExtractProps<(typeof import('../../inertia/pages/settings/api_keys/index.vue'))['default']>
    'settings/audit_log/index': ExtractProps<(typeof import('../../inertia/pages/settings/audit_log/index.vue'))['default']>
    'settings/custom_fields/create': ExtractProps<(typeof import('../../inertia/pages/settings/custom_fields/create.vue'))['default']>
    'settings/custom_fields/edit': ExtractProps<(typeof import('../../inertia/pages/settings/custom_fields/edit.vue'))['default']>
    'settings/custom_fields/index': ExtractProps<(typeof import('../../inertia/pages/settings/custom_fields/index.vue'))['default']>
    'settings/jobs/index': ExtractProps<(typeof import('../../inertia/pages/settings/jobs/index.vue'))['default']>
    'settings/smtp/create': ExtractProps<(typeof import('../../inertia/pages/settings/smtp/create.vue'))['default']>
    'settings/smtp/edit': ExtractProps<(typeof import('../../inertia/pages/settings/smtp/edit.vue'))['default']>
    'settings/smtp/index': ExtractProps<(typeof import('../../inertia/pages/settings/smtp/index.vue'))['default']>
    'settings/tags/edit': ExtractProps<(typeof import('../../inertia/pages/settings/tags/edit.vue'))['default']>
    'settings/tags/index': ExtractProps<(typeof import('../../inertia/pages/settings/tags/index.vue'))['default']>
    'unsubscribe/show': ExtractProps<(typeof import('../../inertia/pages/unsubscribe/show.vue'))['default']>
  }
}
