<script setup lang="ts">
import { computed, ref } from 'vue'
import { STANDARD_FIELDS, type CustomFieldDefinitionOption } from '~/types/segment_definition'

const props = withDefaults(
  defineProps<{ customFieldDefinitions?: CustomFieldDefinitionOption[] }>(),
  { customFieldDefinitions: () => [] }
)
const field = defineModel<string>({ required: true })

const isCustom = computed(() => field.value.startsWith('customFields.'))
const customKey = computed(() => (isCustom.value ? field.value.slice('customFields.'.length) : ''))
// True only once the free-text fallback has actually been chosen — keeps a
// key belonging to a defined custom field on the dropdown option instead of
// falling through to the manual-entry input.
const isFreeformCustom = ref(false)
const manualCustomKey = ref('')

function isDefinedKey(key: string): boolean {
  return props.customFieldDefinitions.some((d) => d.key === key)
}

function onSelect(value: string) {
  if (value === '__custom__') {
    isFreeformCustom.value = true
    field.value = `customFields.${manualCustomKey.value}`
  } else {
    isFreeformCustom.value = false
    field.value = value
  }
}

function onCustomKeyInput(value: string) {
  manualCustomKey.value = value
  field.value = `customFields.${value}`
}
</script>

<template>
  <div class="flex items-center gap-2">
    <select
      class="select select-bordered select-sm"
      :value="isCustom && (isFreeformCustom || !isDefinedKey(customKey)) ? '__custom__' : field"
      @change="onSelect(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="f in STANDARD_FIELDS" :key="f.field" :value="f.field">{{ f.label }}</option>
      <option
        v-for="definition in customFieldDefinitions"
        :key="definition.key"
        :value="`customFields.${definition.key}`"
      >
        {{ definition.label }}
      </option>
      <option value="__custom__">Custom field (other)...</option>
    </select>
    <input
      v-if="isCustom && (isFreeformCustom || !isDefinedKey(customKey))"
      type="text"
      class="input input-bordered input-sm w-32"
      placeholder="key"
      :value="customKey"
      @input="onCustomKeyInput(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
