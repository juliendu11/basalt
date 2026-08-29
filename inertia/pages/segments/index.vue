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
  segments: Array<{
    id: number
    name: string
    description: string | null
    contactCountCache: number
    lastComputationStatus: 'idle' | 'running' | 'success' | 'failed'
    lastComputedAt: string | null
  }>
}>()

const statusBadge: Record<string, string> = {
  idle: 'badge-ghost',
  running: 'badge-info',
  success: 'badge-success',
  failed: 'badge-error',
}
</script>

<template>
  <Head title="Segments" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="segments.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New segment
      </Link>
    </div>

    <div
      v-if="segments.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No segments yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Contacts</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="segment in segments" :key="segment.id">
          <td>
            <Link
              class="link link-hover"
              route="segments.show"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                segmentId: segment.id,
              }"
            >
              {{ segment.name }}
            </Link>
            <p v-if="segment.description" class="text-sm opacity-60">{{ segment.description }}</p>
          </td>
          <td>{{ segment.contactCountCache }}</td>
          <td>
            <span class="badge" :class="statusBadge[segment.lastComputationStatus]">
              {{ segment.lastComputationStatus }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
