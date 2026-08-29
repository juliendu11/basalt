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
    timezone: string
    imageUrl: string | null
  }
}>()
</script>

<template>
  <Head :title="project.name" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <div class="rounded-box border border-base-200 p-8 text-center">
      <p class="mb-4 opacity-70">
        Contacts, campaigns, and statistics for this project — the full dashboard lives on its own
        page.
      </p>
      <Link
        class="btn btn-primary btn-sm"
        route="statistics.dashboard"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      >
        View statistics dashboard
      </Link>
    </div>
  </div>
</template>
