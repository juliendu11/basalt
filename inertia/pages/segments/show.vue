<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import ContactStatusBadge from '~/components/contact_status_badge.vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  segment: {
    id: number
    name: string
    description: string | null
    contactCountCache: number
    lastComputationStatus: 'idle' | 'running' | 'success' | 'failed'
    lastComputedAt: string | null
  }
  contacts: {
    data: Array<{
      id: number
      email: string
      firstName: string | null
      lastName: string | null
      status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'
    }>
    metadata: {
      total: string
      perPage: string
      currentPage: string
      lastPage: string
    }
  }
}>()

const statusBadge: Record<string, string> = {
  idle: 'badge-ghost',
  running: 'badge-info',
  success: 'badge-success',
  failed: 'badge-error',
}
</script>

<template>
  <Head :title="segment.name" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-sm"
        route="segments.edit"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          segmentId: segment.id,
        }"
      >
        Edit segment
      </Link>
    </div>

    <div class="mb-6 rounded-box border border-base-200 p-4">
      <h2 class="text-xl font-semibold">{{ segment.name }}</h2>
      <p v-if="segment.description" class="mb-2 opacity-70">{{ segment.description }}</p>
      <div class="flex items-center gap-3 text-sm">
        <span class="badge" :class="statusBadge[segment.lastComputationStatus]">
          {{ segment.lastComputationStatus }}
        </span>
        <span>{{ segment.contactCountCache }} contact(s)</span>
      </div>
    </div>

    <div
      v-if="contacts.data.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No contacts match this segment yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="contact in contacts.data" :key="contact.id">
          <td>
            <Link
              class="link link-hover"
              route="contacts.show"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                contactId: contact.id,
              }"
            >
              {{ contact.email }}
            </Link>
          </td>
          <td>{{ [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—' }}</td>
          <td><ContactStatusBadge :status="contact.status" /></td>
        </tr>
      </tbody>
    </table>

    <div v-if="Number(contacts.metadata.lastPage) > 1" class="join mt-6">
      <Link
        v-for="page in Number(contacts.metadata.lastPage)"
        :key="page"
        class="join-item btn btn-sm"
        :class="{ 'btn-active': page === Number(contacts.metadata.currentPage) }"
        route="segments.show"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          segmentId: segment.id,
        }"
        :qs="{ page }"
      >
        {{ page }}
      </Link>
    </div>
  </div>
</template>
