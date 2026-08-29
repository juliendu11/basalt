<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  campaign: { id: number; name: string; status: string }
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
</script>

<template>
  <Head :title="`${campaign.name} — Upcoming sends`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link class="btn btn-sm" route="campaigns.show" :params="routeParams">Back to campaign</Link>
    </div>

    <h2 class="mb-1 text-xl font-semibold">{{ campaign.name }} — Upcoming sends</h2>
    <p class="mb-6 text-sm opacity-70">
      Emails this campaign's active executions are scheduled to send next, and to whom.
      <span class="opacity-70">
        An <span class="badge badge-outline badge-xs">estimated</span> time means a not-yet-computed
        wait was projected, or a condition branch was assumed.
      </span>
    </p>

    <div
      v-if="campaign.status !== 'active'"
      class="mb-4 rounded-box border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      This campaign is <strong>{{ campaign.status }}</strong> — nothing will actually send until it
      is active again.
    </div>

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

    <div class="mt-6 flex gap-2">
      <Link
        v-if="upcoming.page > 1"
        class="btn btn-sm"
        route="campaigns.upcoming"
        :params="routeParams"
        :qs="{ page: upcoming.page - 1 }"
      >
        Previous
      </Link>
      <Link
        v-if="upcoming.hasMore"
        class="btn btn-sm"
        route="campaigns.upcoming"
        :params="routeParams"
        :qs="{ page: upcoming.page + 1 }"
      >
        Next
      </Link>
    </div>
  </div>
</template>
