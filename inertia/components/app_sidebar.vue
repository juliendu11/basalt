<script setup lang="ts">
import { usePage } from '@inertiajs/vue3'
import { Link, Form } from '@adonisjs/inertia/vue'
import type { Data } from '@generated/data'
import OrganizationSwitcher from '~/components/organization_switcher.vue'
import ProjectSwitcher from '~/components/project_switcher.vue'
import ThemeSwitcher from '~/components/theme_switcher.vue'
import {
  ChartBarSquareIcon,
  UsersIcon,
  FunnelIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  RectangleGroupIcon,
  InboxIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  Squares2X2Icon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ArrowRightStartOnRectangleIcon,
  ListBulletIcon,
  KeyIcon,
  TagIcon,
} from '@heroicons/vue/24/outline'

const page = usePage<Data.SharedProps>()

function isActive(component: string): boolean {
  return page.component === component
}

function isActiveSection(prefix: string): boolean {
  return page.component.startsWith(prefix)
}

function isActiveAny(components: string[]): boolean {
  return components.includes(page.component)
}
</script>

<template>
  <aside class="bg-base-100 flex min-h-full w-64 flex-col border-r border-base-200">
    <div class="flex items-center gap-2 px-4 py-4">
      <Link route="home" class="text-primary">
        <svg
          width="56"
          height="20"
          viewBox="0 0 105 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0 0h7.5v15H0ZM7.5 15h7.5v15H7.5ZM15 30h7.5v7.5H15ZM22.5 15h7.5v15H22.5ZM30 0h7.5v15H30ZM45 0h7.5v30h15v-30h7.5v37.5h-30v-37.5ZM82.5 37.5V0H105v7.5H90V15h15v7.5H90V30h15v7.5H82.5Z"
            fill="currentColor"
          />
        </svg>
      </Link>
    </div>

    <div class="flex flex-col gap-1 border-b border-base-200 px-3 pb-3">
      <OrganizationSwitcher />
      <ProjectSwitcher />
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-3">
      <template v-if="page.props.currentOrganization && page.props.currentProject">
        <ul class="menu menu-sm w-full gap-0.5 p-0">
          <li>
            <Link
              route="statistics.dashboard"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActive('dashboard/index') }"
            >
              <ChartBarSquareIcon class="h-6 w-6" />
              Dashboard
            </Link>
          </li>
          <li>
            <Link
              route="contacts.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('contacts/') }"
            >
              <UsersIcon class="h-6 w-6" />
              Contacts
            </Link>
          </li>
          <li>
            <Link
              route="segments.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('segments/') }"
            >
              <FunnelIcon class="h-6 w-6" />
              Segments
            </Link>
          </li>
          <li>
            <Link
              route="campaigns.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('campaigns/') }"
            >
              <PaperAirplaneIcon class="h-6 w-6" />
              Campaigns
            </Link>
          </li>
          <li>
            <Link
              route="emails.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('emails/') }"
            >
              <EnvelopeIcon class="h-6 w-6" />
              Emails
            </Link>
          </li>
          <li>
            <Link
              route="email_templates.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('email_templates/') }"
            >
              <DocumentTextIcon class="h-6 w-6" />
              Templates
            </Link>
          </li>
          <li>
            <Link
              route="email_layouts.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('email_layouts/') }"
            >
              <RectangleGroupIcon class="h-6 w-6" />
              Layouts
            </Link>
          </li>
        </ul>

        <div class="menu-title mt-3 text-xs">Project</div>
        <ul class="menu menu-sm w-full gap-0.5 p-0">
          <li>
            <Link
              route="smtp_connectors.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('settings/smtp/') }"
            >
              <InboxIcon class="h-6 w-6" />
              SMTP connectors
            </Link>
          </li>
          <li>
            <Link
              route="custom_field_definitions.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('settings/custom_fields/') }"
            >
              <ListBulletIcon class="h-6 w-6" />
              Custom fields
            </Link>
          </li>
          <li>
            <Link
              route="tags.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('settings/tags/') }"
            >
              <TagIcon class="h-6 w-6" />
              Tags
            </Link>
          </li>
          <li>
            <Link
              route="api_keys.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActiveSection('settings/api_keys/') }"
            >
              <KeyIcon class="h-6 w-6" />
              API keys
            </Link>
          </li>
          <li>
            <Link
              route="audit_log.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActive('settings/audit_log/index') }"
            >
              <ClockIcon class="h-6 w-6" />
              Audit log
            </Link>
          </li>
          <li>
            <Link
              route="failed_jobs.index"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActive('settings/jobs/index') }"
            >
              <ExclamationTriangleIcon class="h-6 w-6" />
              Failed jobs
            </Link>
          </li>
          <li>
            <Link
              route="projects.settings"
              :params="{
                organizationId: page.props.currentOrganization.id,
                projectId: page.props.currentProject.id,
              }"
              :class="{ 'menu-active': isActive('projects/settings') }"
            >
              <Cog6ToothIcon class="h-6 w-6" />
              Project settings
            </Link>
          </li>
        </ul>
      </template>
      <p v-else-if="page.props.currentOrganization" class="px-3 py-2 text-sm opacity-60">
        Select or create a project to see its navigation.
      </p>

      <template v-if="page.props.currentOrganization">
        <div class="menu-title mt-3 text-xs">Organization</div>
        <ul class="menu menu-sm w-full gap-0.5 p-0">
          <li>
            <Link
              route="projects.index"
              :params="{ organizationId: page.props.currentOrganization.id }"
              :class="{
                'menu-active': isActiveAny(['projects/index', 'projects/create', 'projects/show']),
              }"
            >
              <Squares2X2Icon class="h-6 w-6" />
              Projects
            </Link>
          </li>
          <li>
            <Link
              route="organization_members.index"
              :params="{ organizationId: page.props.currentOrganization.id }"
              :class="{ 'menu-active': isActive('organizations/members/index') }"
            >
              <UserGroupIcon class="h-6 w-6" />
              Members
            </Link>
          </li>
          <li>
            <Link
              route="organizations.show"
              :params="{ organizationId: page.props.currentOrganization.id }"
              :class="{ 'menu-active': isActive('organizations/show') }"
            >
              <BuildingOfficeIcon class="h-6 w-6" />
              Organization settings
            </Link>
          </li>
        </ul>
      </template>
    </nav>

    <div class="mt-auto flex items-center gap-2 border-t border-base-200 px-3 py-3">
      <div class="avatar avatar-placeholder">
        <div class="bg-neutral text-neutral-content w-8 rounded-full">
          <span class="text-xs">{{ page.props.user?.initials }}</span>
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ page.props.user?.fullName ?? page.props.user?.email }}
        </p>
      </div>
      <ThemeSwitcher />
      <Form route="session.destroy">
        <button type="submit" class="btn btn-ghost btn-xs" title="Logout">
          <ArrowRightStartOnRectangleIcon class="h-6 w-6" />
        </button>
      </Form>
    </div>
  </aside>
</template>
