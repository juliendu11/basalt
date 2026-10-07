<script setup lang="ts">
import { Head, useForm } from '@inertiajs/vue3'
import PublicLayout from '~/layouts/public.vue'

// Never renders the contact's email or any other contact data
// (docs/plans/17-unsubscribe.md § Security considerations) — only whether
// the link state, and the project's name. GET only shows `confirm`; the
// unsubscribe itself is a POST (link scanners must not trigger it).
const props = defineProps<{
  state: 'confirm' | 'done' | 'invalid'
  projectName: string | null
  token: string | null
}>()

const form = useForm({})

function submit() {
  form.post(`/unsubscribe/${props.token}`)
}

defineOptions({ layout: PublicLayout })
</script>

<template>
  <Head title="Unsubscribe" />

  <template v-if="state === 'confirm'">
    <h1 class="mb-2 text-2xl font-semibold">Unsubscribe</h1>
    <p class="mb-4 opacity-70">Stop receiving emails from {{ projectName }}?</p>
    <button class="btn btn-primary" :disabled="form.processing" @click="submit">
      Confirm unsubscribe
    </button>
  </template>
  <template v-else-if="state === 'done'">
    <h1 class="mb-2 text-2xl font-semibold">You've been unsubscribed</h1>
    <p class="opacity-70">You will no longer receive emails from {{ projectName }}.</p>
  </template>
  <template v-else>
    <h1 class="mb-2 text-2xl font-semibold">This link is no longer valid</h1>
    <p class="opacity-70">If you believe this is a mistake, please contact us directly.</p>
  </template>
</template>
