<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  tag: {
    id: number
    name: string
    color: string
  }
}>()
</script>

<template>
  <Head title="Edit tag" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">Edit tag</h1>

    <Form
      v-slot="{ processing, errors }"
      method="patch"
      route="tags.update"
      :params="{
        organizationId: props.project.organizationId,
        projectId: props.project.id,
        tagId: props.tag.id,
      }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
          :value="tag.name"
          autofocus
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Color</span>
        <input
          name="color"
          type="color"
          class="h-10 w-20 rounded input-bordered"
          :value="tag.color"
        />
        <span v-if="errors.color" class="mt-1 text-sm text-error">{{ errors.color }}</span>
      </label>

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">Save</button>
    </Form>
  </div>
</template>
