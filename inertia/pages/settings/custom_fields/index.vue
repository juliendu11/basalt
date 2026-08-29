<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  definitions: Array<{
    id: number
    key: string
    label: string
    type: 'text' | 'number' | 'boolean' | 'date'
  }>
}>()

function confirmDeletion(event: MouseEvent) {
  if (
    !confirm('Delete this custom field? Existing contact values are kept but stop being typed.')
  ) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Custom fields" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">Custom fields</h1>
      <Link
        class="btn btn-primary btn-sm"
        route="custom_field_definitions.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New custom field
      </Link>
    </div>

    <div
      v-if="definitions.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No custom fields yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Label</th>
          <th>Key</th>
          <th>Type</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="definition in definitions" :key="definition.id">
          <td>
            <Link
              class="link link-hover"
              route="custom_field_definitions.edit"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                customFieldDefinitionId: definition.id,
              }"
            >
              {{ definition.label }}
            </Link>
          </td>
          <td class="font-mono text-sm opacity-70">customFields.{{ definition.key }}</td>
          <td>
            <span class="badge badge-sm">{{ definition.type }}</span>
          </td>
          <td class="flex justify-end gap-2">
            <Form
              method="delete"
              route="custom_field_definitions.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                customFieldDefinitionId: definition.id,
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
