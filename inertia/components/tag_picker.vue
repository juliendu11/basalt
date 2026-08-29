<script setup lang="ts">
import { Form } from '@adonisjs/inertia/vue'

defineProps<{
  organizationId: number
  projectId: number
  contactId: number
  tags: Array<{ id: number; name: string; color: string }>
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span
      v-for="tag in tags"
      :key="tag.id"
      class="badge gap-1"
      :style="{ backgroundColor: tag.color, color: 'white', borderColor: tag.color }"
    >
      {{ tag.name }}
      <Form
        method="delete"
        route="contacts.tags.detach"
        :params="{ organizationId, projectId, contactId, tagId: tag.id }"
      >
        <button type="submit" class="ml-1" aria-label="Remove tag">&times;</button>
      </Form>
    </span>

    <Form
      v-slot="{ processing }"
      route="contacts.tags.attach"
      :params="{ organizationId, projectId, contactId }"
      class="flex items-center gap-1"
    >
      <input
        name="name"
        type="text"
        placeholder="Add tag"
        class="input input-bordered input-xs w-28"
      />
      <button type="submit" class="btn btn-ghost btn-xs" :disabled="processing">Add</button>
    </Form>
  </div>
</template>
