<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

type SentStatus = 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  campaign: { id: number; name: string; status: string }
  sent: {
    data: Array<{
      deliveryId: number
      contactId: number
      contactEmail: string
      emailId: number | null
      subject: string | null
      status: SentStatus
      sentAt: string | null
      deliveredAt: string | null
      openedAt: string | null
      clickedAt: string | null
    }>
    page: number
    hasMore: boolean
  }
  upcoming: {
    data: Array<{
      contactId: number
      contactEmail: string
      nodeId: number
      emailId: number | null
      subject: string | null
      estimatedSendAt: string | null
      certainty: 'scheduled' | 'estimated'
    }>
    page: number
    hasMore: boolean
  }
}>()

const routeParams = {
  organizationId: props.project.organizationId,
  projectId: props.project.id,
  campaignId: props.campaign.id,
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function statusBadgeClass(status: SentStatus): string {
  if (status === 'delivered') return 'badge-success'
  if (status === 'bounced' || status === 'failed') return 'badge-error'
  return 'badge-ghost'
}
</script>

<template>
  <Head :title="`${campaign.name} — Email activity`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link class="btn btn-sm" route="campaigns.show" :params="routeParams">Back to campaign</Link>
    </div>

    <h2 class="mb-1 text-xl font-semibold">{{ campaign.name }} — Email activity</h2>
    <p class="mb-6 text-sm opacity-70">
      What this campaign has already sent, and what its active executions are scheduled to send
      next.
    </p>

    <div
      v-if="campaign.status !== 'active'"
      class="mb-6 rounded-box border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      This campaign is <strong>{{ campaign.status }}</strong> — nothing will actually send until it
      is active again.
    </div>

    <section class="mb-10">
      <h3 class="mb-1 text-lg font-semibold">Recently sent</h3>
      <p class="mb-3 text-sm opacity-70">Deliveries this campaign has made, most recent first.</p>

      <div
        v-if="sent.data.length === 0"
        class="rounded-box border border-base-200 p-8 text-center opacity-70"
      >
        Nothing sent yet.
      </div>

      <table v-else class="table">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Email</th>
            <th>Sent</th>
            <th>Status</th>
            <th>Engagement</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sent.data" :key="row.deliveryId">
            <td>
              <Link
                class="link link-hover"
                route="contacts.show"
                :params="{
                  organizationId: project.organizationId,
                  projectId: project.id,
                  contactId: row.contactId,
                }"
              >
                {{ row.contactEmail }}
              </Link>
            </td>
            <td>{{ row.subject ?? 'Untitled email' }}</td>
            <td>{{ formatDate(row.sentAt) }}</td>
            <td>
              <span class="badge badge-xs" :class="statusBadgeClass(row.status)">
                {{ row.status }}
              </span>
            </td>
            <td>
              <span class="flex flex-wrap gap-1">
                <span
                  v-if="row.openedAt"
                  class="badge badge-outline badge-xs"
                  :title="formatDate(row.openedAt)"
                >
                  opened
                </span>
                <span
                  v-if="row.clickedAt"
                  class="badge badge-outline badge-xs"
                  :title="formatDate(row.clickedAt)"
                >
                  clicked
                </span>
                <span v-if="!row.openedAt && !row.clickedAt" class="opacity-50">—</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-4 flex gap-2">
        <Link
          v-if="sent.page > 1"
          class="btn btn-sm"
          route="campaigns.upcoming"
          :params="routeParams"
          :qs="{ sentPage: sent.page - 1, page: upcoming.page }"
        >
          Previous
        </Link>
        <Link
          v-if="sent.hasMore"
          class="btn btn-sm"
          route="campaigns.upcoming"
          :params="routeParams"
          :qs="{ sentPage: sent.page + 1, page: upcoming.page }"
        >
          Next
        </Link>
      </div>
    </section>

    <section>
      <h3 class="mb-1 text-lg font-semibold">Upcoming sends</h3>
      <p class="mb-3 text-sm opacity-70">
        Emails this campaign's active executions are scheduled to send next, and to whom.
        <span class="opacity-70">
          An <span class="badge badge-outline badge-xs">estimated</span> time means a
          not-yet-computed wait was projected, or a condition branch was assumed.
        </span>
      </p>

      <div
        v-if="upcoming.data.length === 0"
        class="rounded-box border border-base-200 p-8 text-center opacity-70"
      >
        No upcoming sends.
      </div>

      <table v-else class="table">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Email</th>
            <th>Estimated send</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(send, index) in upcoming.data" :key="index">
            <td>
              <Link
                class="link link-hover"
                route="contacts.show"
                :params="{
                  organizationId: project.organizationId,
                  projectId: project.id,
                  contactId: send.contactId,
                }"
              >
                {{ send.contactEmail }}
              </Link>
            </td>
            <td>{{ send.subject ?? 'Untitled email' }}</td>
            <td>{{ formatDate(send.estimatedSendAt) }}</td>
            <td>
              <span
                class="badge badge-xs"
                :class="send.certainty === 'scheduled' ? 'badge-ghost' : 'badge-outline'"
              >
                {{ send.certainty }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-4 flex gap-2">
        <Link
          v-if="upcoming.page > 1"
          class="btn btn-sm"
          route="campaigns.upcoming"
          :params="routeParams"
          :qs="{ page: upcoming.page - 1, sentPage: sent.page }"
        >
          Previous
        </Link>
        <Link
          v-if="upcoming.hasMore"
          class="btn btn-sm"
          route="campaigns.upcoming"
          :params="routeParams"
          :qs="{ page: upcoming.page + 1, sentPage: sent.page }"
        >
          Next
        </Link>
      </div>
    </section>
  </div>
</template>
