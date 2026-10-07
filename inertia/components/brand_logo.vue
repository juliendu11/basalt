<script setup lang="ts">
withDefaults(defineProps<{ size?: number; word?: boolean }>(), { size: 24, word: false })
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" />
    </svg>
    <span v-if="word" class="text-xl leading-none font-bold tracking-tight">basalt</span>
  </span>
</template>
