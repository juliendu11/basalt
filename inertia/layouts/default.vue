<script setup lang="ts">
import { watch } from 'vue'
import { usePage } from '@inertiajs/vue3'
import { toast, Toaster } from 'vue-sonner'
import type { Data } from '@generated/data'
import { Link } from '@adonisjs/inertia/vue'
import AppSidebar from '~/components/app_sidebar.vue'
import ThemeSwitcher from '~/components/theme_switcher.vue'

const page = usePage<Data.SharedProps>()

watch(
  () => page.url,
  () => toast.dismiss()
)

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
  <div v-if="page.props.user" class="drawer lg:drawer-open">
    <input id="app-drawer" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex min-h-screen flex-col">
      <header class="navbar border-b border-base-200 px-4 lg:hidden">
        <label for="app-drawer" class="btn btn-square btn-ghost" aria-label="Open navigation">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </label>
        <div class="ml-auto">
          <ThemeSwitcher />
        </div>
      </header>

      <main class="flex-1">
        <slot />
      </main>
    </div>

    <div class="drawer-side z-20">
      <label for="app-drawer" class="drawer-overlay" aria-label="Close navigation"></label>
      <AppSidebar />
    </div>
  </div>

  <template v-else>
    <header class="navbar border-b border-base-200 px-4">
      <div class="navbar-start gap-3">
        <Link route="home">
          <svg
            width="66"
            height="24"
            viewBox="0 0 105 38"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 0h7.5v15H0ZM7.5 15h7.5v15H7.5ZM15 30h7.5v7.5H15ZM22.5 15h7.5v15H22.5ZM30 0h7.5v15H30ZM45 0h7.5v30h15v-30h7.5v37.5h-30v-37.5ZM82.5 37.5V0H105v7.5H90V15h15v7.5H90V30h15v7.5H82.5Z"
              fill="currentColor"
            />
          </svg>
        </Link>
      </div>
      <div class="navbar-end">
        <nav class="flex items-center gap-3">
          <ThemeSwitcher />
          <Link route="new_account.create" class="btn btn-ghost btn-sm">Signup</Link>
          <Link route="session.create" class="btn btn-ghost btn-sm">Login</Link>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>
  </template>

  <Toaster position="top-center" rich-colors />
</template>
