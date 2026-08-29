<script setup lang="ts">
const config = defineModel<any>({ required: true })

defineProps<{ sendEmailNodes: { clientKey: string; label: string }[] }>()
</script>

<template>
  <label class="form-control">
    <span class="label-text mb-1">Send-email node</span>
    <select
      class="select select-bordered select-sm"
      :value="config.referenceNodeId ?? ''"
      @change="config = { ...config, referenceNodeId: ($event.target as HTMLSelectElement).value }"
    >
      <option value="" disabled>Select a send-email node...</option>
      <option v-for="n in sendEmailNodes" :key="n.clientKey" :value="n.clientKey">
        {{ n.label }}
      </option>
    </select>
  </label>
</template>
