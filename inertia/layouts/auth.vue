<script setup lang="ts">
import { watch } from 'vue'
import { usePage, Head } from '@inertiajs/vue3'
import { toast, Toaster } from 'vue-sonner'
import type { Data } from '@generated/data'

// Deliberately NOT `default.vue`: the login/signup screens are the one
// place a visitor arrives with no session and no app context yet — a
// navbar with app navigation (organization/project switchers) has nothing
// to switch between. Still replicates default.vue's flash->toast wiring,
// since AdonisJS's own invalid-credentials exception
// (@adonisjs/auth E_INVALID_CREDENTIALS) flashes `error` and redirects
// back rather than returning a field-level validation error — without
// this the message would be flashed but never shown.
const page = usePage<Data.SharedProps>()

watch(
  () => page.flash,
  (flashMessages) => {
    if (flashMessages.error) {
      toast.error(flashMessages.error)
    }
    if (flashMessages.success) {
      toast.success(flashMessages.success)
    }
  },
  { immediate: true }
)
</script>

<template>
  <Head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800;900&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,500&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
  </Head>

  <main class="min-h-screen bg-base-100">
    <slot />
  </main>

  <Toaster position="top-center" rich-colors />
</template>
