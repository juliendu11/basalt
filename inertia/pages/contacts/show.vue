<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ContactStatusBadge from '~/components/contact_status_badge.vue'
import TagPicker from '~/components/tag_picker.vue'

const props = defineProps<{
  contact: {
    id: number
    projectId: number
    email: string
    firstName: string | null
    lastName: string | null
    phone: string | null
    company: string | null
    country: string | null
    city: string | null
    language: string | null
    timezone: string | null
    status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'
    tags?: Array<{ id: number; name: string; color: string }>
  }
  project: { id: number; organizationId: number; name: string; slug: string }
  upcomingSends: Array<{
    campaignId: number
    campaignName: string
    campaignStatus: string
    nodeId: number
    emailId: number | null
    subject: string | null
    estimatedSendAt: string | null
    certainty: 'scheduled' | 'estimated'
  }>
}>()

function confirmDeletion(event: MouseEvent) {
  if (!confirm(`Delete ${props.contact.email}? This cannot be undone.`)) {
    event.preventDefault()
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <Head :title="contact.email" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">{{ contact.email }}</h1>
      <ContactStatusBadge :status="contact.status" />
    </div>

    <p class="mb-6 opacity-70">
      {{ [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'No name' }}
    </p>

    <section class="mb-6 grid grid-cols-2 gap-4 text-sm">
      <div>
        <span class="opacity-60">Phone</span>
        <p>{{ contact.phone ?? '—' }}</p>
      </div>
      <div>
        <span class="opacity-60">Company</span>
        <p>{{ contact.company ?? '—' }}</p>
      </div>
      <div>
        <span class="opacity-60">Country</span>
        <p>{{ contact.country ?? '—' }}</p>
      </div>
      <div>
        <span class="opacity-60">City</span>
        <p>{{ contact.city ?? '—' }}</p>
      </div>
      <div>
        <span class="opacity-60">Language</span>
        <p>{{ contact.language ?? '—' }}</p>
      </div>
      <div>
        <span class="opacity-60">Timezone</span>
        <p>{{ contact.timezone ?? '—' }}</p>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="mb-2 text-lg font-medium">Upcoming emails</h2>
      <p class="mb-3 text-sm opacity-70">
        Emails campaigns are scheduled to send to this contact next.
      </p>

      <div
        v-if="upcomingSends.length === 0"
        class="rounded-box border border-base-200 p-6 text-center text-sm opacity-70"
      >
        No upcoming emails scheduled.
      </div>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="send in upcomingSends"
          :key="`${send.campaignId}-${send.nodeId}-${send.estimatedSendAt}`"
          class="flex items-start justify-between gap-3 rounded-box border border-base-200 p-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ send.subject ?? 'Untitled email' }}</p>
            <p class="text-xs opacity-70">
              <Link
                class="link link-hover"
                route="campaigns.show"
                :params="{
                  organizationId: project.organizationId,
                  projectId: project.id,
                  campaignId: send.campaignId,
                }"
              >
                {{ send.campaignName }}
              </Link>
              <span
                v-if="send.campaignStatus !== 'active'"
                class="ml-1 badge badge-warning badge-xs"
              >
                {{ send.campaignStatus }}
              </span>
            </p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-sm">{{ formatDate(send.estimatedSendAt) }}</p>
            <span
              class="badge badge-xs"
              :class="send.certainty === 'scheduled' ? 'badge-ghost' : 'badge-outline'"
            >
              {{ send.certainty === 'scheduled' ? 'scheduled' : 'estimated' }}
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section class="mb-8">
      <h2 class="mb-2 text-lg font-medium">Tags</h2>
      <TagPicker
        :organization-id="project.organizationId"
        :project-id="project.id"
        :contact-id="contact.id"
        :tags="contact.tags ?? []"
      />
    </section>

    <div class="flex gap-3">
      <Link
        class="btn btn-sm"
        route="contacts.edit"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        Edit
      </Link>
      <Link
        class="btn btn-sm"
        route="contacts.history"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        History
      </Link>
      <Form
        v-if="contact.status !== 'unsubscribed'"
        method="post"
        route="contacts.unsubscribe"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        <button type="submit" class="btn btn-sm">Unsubscribe</button>
      </Form>
      <Form
        v-else
        method="post"
        route="contacts.resubscribe"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        <button type="submit" class="btn btn-sm">Resubscribe</button>
      </Form>
      <Form
        method="delete"
        route="contacts.destroy"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        <button type="submit" class="btn btn-error btn-sm" @click="confirmDeletion">Delete</button>
      </Form>
    </div>
  </div>
</template>
