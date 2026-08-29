<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  layouts: Array<{ id: number; name: string; updatedAt: string | null }>
}>()

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this layout? This cannot be undone.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Email layouts" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="email_layouts.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New layout
      </Link>
    </div>

    <div
      v-if="layouts.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No email layouts yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="layout in layouts" :key="layout.id">
          <td>
            <Link
              class="link link-hover"
              route="email_layouts.edit"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                layoutId: layout.id,
              }"
            >
              {{ layout.name }}
            </Link>
          </td>
          <td class="flex flex-wrap gap-2">
            <Form
              method="post"
              route="email_layouts.duplicate"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                layoutId: layout.id,
              }"
            >
              <button type="submit" class="btn btn-xs">Duplicate</button>
            </Form>
            <Form
              method="delete"
              route="email_layouts.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                layoutId: layout.id,
              }"
            >
              <button type="submit" class="btn btn-xs btn-error" @click="confirmDeletion">
                Delete
              </button>
            </Form>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
