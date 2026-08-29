<script setup lang="ts">
// Minimal chrome for a standalone public page reached by an unauthenticated
// visitor from an email link (docs/plans/17-unsubscribe.md § Frontend
// architecture) — deliberately NOT `default.vue`: no project nav/switcher,
// no session-dependent header, nothing that assumes an app user.
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md text-center">
      <slot />
    </div>
  </main>
</template>
