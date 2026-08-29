<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import EntityAvatar from '~/components/entity_avatar.vue'

const props = defineProps<{
  organization: { id: number; name: string; slug: string }
  organizationProjects: Array<{
    id: number
    name: string
    slug: string
    timezone: string
    imageUrl: string | null
  }>
}>()
</script>

<template>
  <Head :title="`${organization.name} — Projects`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">Projects</h1>
      <Link
        route="projects.create"
        :params="{ organizationId: props.organization.id }"
        class="btn btn-primary btn-sm"
      >
        New project
      </Link>
    </div>

    <div
      v-if="organizationProjects.length === 0"
      class="rounded-box border border-base-200 p-8 text-center"
    >
      <p class="mb-4 opacity-70">This organization doesn't have any project yet.</p>
      <Link
        route="projects.create"
        :params="{ organizationId: props.organization.id }"
        class="btn btn-primary btn-sm"
      >
        Create your first project
      </Link>
    </div>

    <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Link
        v-for="project in organizationProjects"
        :key="project.id"
        route="projects.show"
        :params="{ organizationId: props.organization.id, projectId: project.id }"
      >
        <div class="card border border-base-200">
          <div class="card-body">
            <EntityAvatar
              :name="project.name"
              :image-url="project.imageUrl"
              img-class="mb-2 h-10 w-10 rounded-box"
            />
            {{ project.name }}
          </div>
        </div>
      </Link>
    </div>
  </div>
</template>
