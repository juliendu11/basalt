<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import PublicLayout from '~/layouts/public.vue'

// Never renders the contact's email or any other contact data
// (docs/plans/17-unsubscribe.md § Security considerations) — only whether
// the link was valid, and the project's name.
defineProps<{
  valid: boolean
  projectName: string | null
}>()

defineOptions({ layout: PublicLayout })
</script>

<template>
  <Head title="Unsubscribe" />

  <template v-if="valid">
    <h1 class="mb-2 text-2xl font-semibold">You've been unsubscribed</h1>
    <p class="opacity-70">You will no longer receive emails from {{ projectName }}.</p>
  </template>
  <template v-else>
    <h1 class="mb-2 text-2xl font-semibold">This link is no longer valid</h1>
    <p class="opacity-70">If you believe this is a mistake, please contact us directly.</p>
  </template>
</template>
