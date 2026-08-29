<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  id: string
  name: string
  label: string
  autocomplete: string
  error?: string
  autofocus?: boolean
}>()

const visible = ref(false)
</script>

<template>
  <label :for="id" class="form-control block">
    <span class="field-label mb-1.5 block">{{ label }}</span>
    <div class="relative">
      <input
        :id="id"
        :name="name"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :autofocus="autofocus"
        class="input input-bordered w-full pr-11"
        :class="{ 'input-error': error }"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-base-content/40 transition-colors hover:text-base-content"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        tabindex="-1"
        @click="visible = !visible"
      >
        <svg
          v-if="!visible"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-[18px] w-[18px]"
        >
          <path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-[18px] w-[18px]"
        >
          <path d="M3 3l18 18" />
          <path
            d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c7 0 10.5 6.5 10.5 6.5a15.6 15.6 0 0 1-3.4 4.2M6.5 7.8A15.7 15.7 0 0 0 1.5 12S5 18.5 12 18.5c1.4 0 2.7-.2 3.9-.6"
          />
          <path d="M9.5 10a3 3 0 0 0 4.2 4.2" />
        </svg>
      </button>
    </div>
    <span v-if="error" class="mt-1.5 block text-sm text-error">{{ error }}</span>
  </label>
</template>

<style scoped>
.field-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in oklab, currentColor 60%, transparent);
}
</style>
