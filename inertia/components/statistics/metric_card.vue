<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  hint?: string
}>()
</script>

<template>
  <div class="card border border-base-200">
    <div class="card-body">
      <p class="text-sm opacity-60">{{ label }}</p>
      <p class="text-2xl font-semibold">{{ value }}</p>
      <p v-if="hint" class="text-xs opacity-50">{{ hint }}</p>
    </div>
  </div>
</template>
