<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  definition: {
    id: number
    key: string
    label: string
    type: 'text' | 'number' | 'boolean' | 'date'
  }
}>()
</script>

<template>
  <Head title="Edit custom field" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">Edit custom field</h1>

    <Form
      v-slot="{ processing, errors }"
      method="patch"
      route="custom_field_definitions.update"
      :params="{
        organizationId: props.project.organizationId,
        projectId: props.project.id,
        customFieldDefinitionId: props.definition.id,
      }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Label</span>
        <input
          name="label"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.label }"
          :value="definition.label"
          autofocus
        />
        <span v-if="errors.label" class="mt-1 text-sm text-error">{{ errors.label }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Key</span>
        <input
          type="text"
          class="input input-bordered w-full font-mono"
          :value="`customFields.${definition.key}`"
          disabled
        />
        <span class="mt-1 text-xs opacity-60">Cannot be changed after creation.</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Type</span>
        <input type="text" class="input input-bordered w-full" :value="definition.type" disabled />
        <span class="mt-1 text-xs opacity-60">Cannot be changed after creation.</span>
      </label>

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">Save</button>
    </Form>
  </div>
</template>
