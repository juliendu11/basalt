<script setup lang="ts">
import EntityAvatar from '~/components/entity_avatar.vue'

defineProps<{
  project: { name: string; imageUrl: string | null }
}>()
</script>

<template>
  <h1 class="mb-8 flex items-center gap-3 text-2xl font-semibold">
    <EntityAvatar
      :name="project.name"
      :image-url="project.imageUrl"
      img-class="h-8 w-8 rounded-box"
    />
    {{ project.name }}
  </h1>
</template>
