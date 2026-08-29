<script setup lang="ts">
defineProps<{
  name: string
  imageUrl: string | null
  /** Tailwind sizing/shape classes (e.g. "h-6 w-6 rounded-box"), applied to both the image and the placeholder. */
  imgClass: string
}>()
</script>

<template>
  <img v-if="imageUrl" :src="imageUrl" alt="" class="object-cover" :class="imgClass" />
  <div v-else class="avatar avatar-placeholder shrink-0">
    <div class="bg-neutral text-neutral-content" :class="imgClass">
      <span class="text-[0.6em] leading-none">{{
        name.trim().charAt(0).toUpperCase() || '?'
      }}</span>
    </div>
  </div>
</template>
