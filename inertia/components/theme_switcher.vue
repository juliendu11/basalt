<script setup lang="ts">
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline'
import { useTheme } from '~/lib/theme'

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <label
    class="swap swap-rotate btn btn-ghost btn-sm btn-square"
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
  >
    <input
      type="checkbox"
      class="theme-controller"
      :checked="theme === 'dark'"
      @change="toggleTheme"
    />
    <SunIcon class="swap-off h-5 w-5" />
    <MoonIcon class="swap-on h-5 w-5" />
  </label>
</template>
