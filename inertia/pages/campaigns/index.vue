<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  campaigns: Array<{
    id: number
    name: string
    description: string | null
    status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
    createdAt: string | null
  }>
}>()

const statusBadge: Record<string, string> = {
  draft: 'badge-ghost',
  active: 'badge-success',
  paused: 'badge-warning',
  completed: 'badge-info',
  archived: 'badge-neutral',
}
</script>

<template>
  <Head title="Campaigns" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="campaigns.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New campaign
      </Link>
    </div>
    <div
      v-if="campaigns.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No campaigns yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="campaign in campaigns" :key="campaign.id">
          <td>
            <Link
              class="link link-hover"
              route="campaigns.show"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                campaignId: campaign.id,
              }"
            >
              {{ campaign.name }}
            </Link>
            <p v-if="campaign.description" class="text-sm opacity-60">
              {{ campaign.description }}
            </p>
          </td>
          <td>
            <span class="badge" :class="statusBadge[campaign.status]">{{ campaign.status }}</span>
          </td>
          <td>
            {{ campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
