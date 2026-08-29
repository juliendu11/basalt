<script setup lang="ts">
const config = defineModel<any>({ required: true })

defineProps<{ segments: { id: number; name: string }[] }>()
</script>

<template>
  <label class="form-control">
    <span class="label-text mb-1">Segment</span>
    <select
      class="select select-bordered select-sm"
      :value="config.segmentId ?? ''"
      @change="
        config = { ...config, segmentId: Number(($event.target as HTMLSelectElement).value) }
      "
    >
      <option value="" disabled>Select a segment...</option>
      <option v-for="s in segments" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
  </label>
</template>
