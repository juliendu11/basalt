<script setup lang="ts">
const config = defineModel<any>({ required: true })

defineProps<{ tags: { id: number; name: string }[] }>()
</script>

<template>
  <label class="form-control">
    <span class="label-text mb-1">Tag</span>
    <select
      class="select select-bordered select-sm"
      :value="config.tagId ?? ''"
      @change="config = { ...config, tagId: Number(($event.target as HTMLSelectElement).value) }"
    >
      <option value="" disabled>Select a tag...</option>
      <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
    </select>
  </label>
</template>
