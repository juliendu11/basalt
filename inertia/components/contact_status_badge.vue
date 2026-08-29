<script setup lang="ts">
const props = defineProps<{
  status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'
}>()

const badgeClass: Record<typeof props.status, string> = {
  subscribed: 'badge-success',
  unsubscribed: 'badge-ghost',
  bounced: 'badge-warning',
  complained: 'badge-error',
  blocked: 'badge-neutral',
}
</script>

<template>
  <span class="badge badge-sm" :class="badgeClass[status]">{{ status }}</span>
</template>
