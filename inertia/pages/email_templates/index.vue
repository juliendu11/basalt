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
  templates: Array<{ id: number; name: string; subject: string; updatedAt: string | null }>
}>()

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this template? This cannot be undone.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Email templates" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="email_templates.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New template
      </Link>
    </div>

    <div
      v-if="templates.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No email templates yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Subject</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="template in templates" :key="template.id">
          <td>
            <Link
              class="link link-hover"
              route="email_templates.edit"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                templateId: template.id,
              }"
            >
              {{ template.name }}
            </Link>
          </td>
          <td>{{ template.subject }}</td>
          <td class="flex flex-wrap gap-2">
            <Form
              method="post"
              route="email_templates.duplicate"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                templateId: template.id,
              }"
            >
              <button type="submit" class="btn btn-xs">Duplicate</button>
            </Form>
            <Form
              method="delete"
              route="email_templates.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                templateId: template.id,
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
