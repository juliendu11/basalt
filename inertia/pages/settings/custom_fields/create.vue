<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
}>()
</script>

<template>
  <Head title="New custom field" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New custom field</h1>

    <Form
      v-slot="{ processing, errors }"
      route="custom_field_definitions.store"
      :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Label</span>
        <input
          name="label"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.label }"
          autofocus
        />
        <span v-if="errors.label" class="mt-1 text-sm text-error">{{ errors.label }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Key</span>
        <input
          name="key"
          type="text"
          placeholder="age"
          class="input input-bordered w-full font-mono"
          :class="{ 'input-error': errors.key }"
        />
        <span class="mt-1 text-xs opacity-60">
          Letters, digits and underscores only — used as customFields.&lt;key&gt; in segments, and
          cannot be changed later.
        </span>
        <span v-if="errors.key" class="mt-1 text-sm text-error">{{ errors.key }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Type</span>
        <select
          name="type"
          class="select select-bordered w-full"
          :class="{ 'select-error': errors.type }"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="date">Date</option>
        </select>
        <span class="mt-1 text-xs opacity-60">Cannot be changed later.</span>
        <span v-if="errors.type" class="mt-1 text-sm text-error">{{ errors.type }}</span>
      </label>

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">
        Create custom field
      </button>
    </Form>
  </div>
</template>
