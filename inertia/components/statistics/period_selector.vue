<script setup lang="ts">
import { ref } from 'vue'
import { router } from '@inertiajs/vue3'

const props = defineProps<{ period: string }>()

const presets = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
]

const customFrom = ref('')
const customTo = ref('')

function select(period: string) {
  router.get(window.location.pathname, { period }, { preserveState: true, preserveScroll: true })
}

function submitCustom() {
  if (!customFrom.value || !customTo.value) return
  router.get(
    window.location.pathname,
    { period: 'custom', from: customFrom.value, to: customTo.value },
    { preserveState: true, preserveScroll: true }
  )
}
</script>

<template>
  <div class="mb-6 flex flex-wrap items-center gap-2">
    <button
      v-for="preset in presets"
      :key="preset.value"
      type="button"
      class="btn btn-sm"
      :class="props.period === preset.value ? 'btn-primary' : 'btn-ghost'"
      @click="select(preset.value)"
    >
      {{ preset.label }}
    </button>

    <div class="join">
      <input v-model="customFrom" type="date" class="input input-bordered input-sm join-item" />
      <input v-model="customTo" type="date" class="input input-bordered input-sm join-item" />
      <button
        type="button"
        class="btn btn-sm join-item"
        :class="props.period === 'custom' ? 'btn-primary' : 'btn-ghost'"
        @click="submitCustom"
      >
        Apply
      </button>
    </div>
  </div>
</template>
