<script setup lang="ts">
import { onMounted } from 'vue'

const config = defineModel<any>({ required: true })

// The inputs below show "1" / "hours" as placeholders via `??` when the
// config is empty, but that's display-only — nothing persisted those
// defaults into the model. A node left untouched by the user therefore
// looked configured in the UI while actually saving as `{}`, which fails
// `waitSchema` validation on save/publish. Writing the shown defaults back
// on mount keeps the model truthful to what's displayed.
onMounted(() => {
  if (config.value.durationValue === undefined || config.value.durationUnit === undefined) {
    config.value = {
      durationValue: 1,
      durationUnit: 'hours',
      ...config.value,
    }
  }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="form-control">
      <span class="label-text mb-1">Duration</span>
      <div class="flex gap-2">
        <input
          type="number"
          min="1"
          class="input input-bordered input-sm w-24"
          :value="config.durationValue ?? 1"
          @input="
            config = {
              ...config,
              durationValue: Number(($event.target as HTMLInputElement).value),
            }
          "
        />
        <select
          class="select select-bordered select-sm"
          :value="config.durationUnit ?? 'hours'"
          @change="config = { ...config, durationUnit: ($event.target as HTMLSelectElement).value }"
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </label>
  </div>
</template>
