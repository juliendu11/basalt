<script setup lang="ts">
import { computed } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ContactStatusBadge from '~/components/contact_status_badge.vue'
import TagPicker from '~/components/tag_picker.vue'

type SentEmail = {
  deliveryId: number
  campaignId: number | null
  campaignName: string | null
  emailId: number | null
  subject: string | null
  status: 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced'
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
}

type UpcomingSend = {
  campaignId: number
  campaignName: string
  campaignStatus: string
  nodeId: number
  emailId: number | null
  subject: string | null
  estimatedSendAt: string | null
  certainty: 'scheduled' | 'estimated'
}

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
  sentEmails: SentEmail[]
  upcomingSends: UpcomingSend[]
}>()

type TimelineRow =
  | { key: string; kind: 'sent'; at: string | null; sent: SentEmail }
  | { key: string; kind: 'now' }
  | { key: string; kind: 'upcoming'; at: string | null; send: UpcomingSend }

const hasEmails = computed(() => props.sentEmails.length > 0 || props.upcomingSends.length > 0)

// Past sends (oldest → newest), a "Now" pivot, then projected upcoming sends
// (earliest → latest) — one straight top-to-bottom chronological read.
const timeline = computed<TimelineRow[]>(() => {
  const rows: TimelineRow[] = []
  for (const sent of props.sentEmails) {
    rows.push({ key: `sent-${sent.deliveryId}`, kind: 'sent', at: sent.sentAt, sent })
  }
  rows.push({ key: 'now', kind: 'now' })
  for (const send of props.upcomingSends) {
    rows.push({
      key: `upcoming-${send.campaignId}-${send.nodeId}-${send.estimatedSendAt}`,
      kind: 'upcoming',
      at: send.estimatedSendAt,
      send,
    })
  }
  return rows
})

function statusBadgeClass(status: SentEmail['status']): string {
  if (status === 'delivered') return 'badge-success'
  if (status === 'bounced' || status === 'failed') return 'badge-error'
  return 'badge-ghost'
}

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

    <div class="divider"></div>

    <section>
      <h2 class="mb-2 text-lg font-medium">Email timeline</h2>
      <p class="mb-3 text-sm opacity-70">
        Emails already sent to this contact, and what campaigns are scheduled to send next.
      </p>

      <div
        v-if="!hasEmails"
        class="rounded-box border border-base-200 p-6 text-center text-sm opacity-70"
      >
        No emails sent to this contact yet, and none scheduled.
      </div>

      <ul v-else class="timeline timeline-vertical timeline-compact">
        <li v-for="(row, index) in timeline" :key="row.key">
          <hr v-if="index > 0" />

          <template v-if="row.kind === 'now'">
            <div class="timeline-middle">
              <span class="badge badge-primary badge-sm">Now</span>
            </div>
          </template>

          <template v-else-if="row.kind === 'sent'">
            <div class="timeline-start text-xs opacity-60">{{ formatDate(row.at) }}</div>
            <div class="timeline-middle text-success">●</div>
            <div class="timeline-end rounded-box border border-base-200 p-3">
              <p class="text-sm font-medium">{{ row.sent.subject ?? 'Untitled email' }}</p>
              <p class="text-xs opacity-70">
                <Link
                  v-if="row.sent.campaignId"
                  class="link link-hover"
                  route="campaigns.show"
                  :params="{
                    organizationId: project.organizationId,
                    projectId: project.id,
                    campaignId: row.sent.campaignId,
                  }"
                >
                  {{ row.sent.campaignName ?? 'Campaign' }}
                </Link>
                <span v-else>Direct send</span>
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <span class="badge badge-xs" :class="statusBadgeClass(row.sent.status)">
                  {{ row.sent.status }}
                </span>
                <span
                  v-if="row.sent.openedAt"
                  class="badge badge-outline badge-xs"
                  :title="formatDate(row.sent.openedAt)"
                >
                  opened
                </span>
                <span
                  v-if="row.sent.clickedAt"
                  class="badge badge-outline badge-xs"
                  :title="formatDate(row.sent.clickedAt)"
                >
                  clicked
                </span>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="timeline-start text-xs opacity-60">{{ formatDate(row.at) }}</div>
            <div class="timeline-middle opacity-40">○</div>
            <div class="timeline-end rounded-box border border-dashed border-base-300 p-3">
              <p class="text-sm font-medium">{{ row.send.subject ?? 'Untitled email' }}</p>
              <p class="text-xs opacity-70">
                <Link
                  class="link link-hover"
                  route="campaigns.show"
                  :params="{
                    organizationId: project.organizationId,
                    projectId: project.id,
                    campaignId: row.send.campaignId,
                  }"
                >
                  {{ row.send.campaignName }}
                </Link>
                <span
                  v-if="row.send.campaignStatus !== 'active'"
                  class="ml-1 badge badge-warning badge-xs"
                >
                  {{ row.send.campaignStatus }}
                </span>
              </p>
              <div class="mt-1">
                <span
                  class="badge badge-xs"
                  :class="row.send.certainty === 'scheduled' ? 'badge-ghost' : 'badge-outline'"
                >
                  {{ row.send.certainty === 'scheduled' ? 'scheduled' : 'estimated' }}
                </span>
              </div>
            </div>
          </template>

          <hr v-if="index < timeline.length - 1" />
        </li>
      </ul>
    </section>
  </div>
</template>
