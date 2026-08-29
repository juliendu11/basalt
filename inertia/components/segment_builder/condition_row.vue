<script setup lang="ts">
import { computed } from 'vue'
import FieldPicker from '~/components/segment_builder/field_picker.vue'
import {
  CONTACT_STATUSES,
  OPERATORS_BY_KIND,
  fieldKind,
  operatorNeedsListValue,
  operatorNeedsValue,
  type CustomFieldDefinitionOption,
  type SegmentCondition,
  type SegmentOperator,
  type TagOption,
} from '~/types/segment_definition'

const props = withDefaults(
  defineProps<{ customFieldDefinitions?: CustomFieldDefinitionOption[]; tags?: TagOption[] }>(),
  { customFieldDefinitions: () => [], tags: () => [] }
)
const condition = defineModel<SegmentCondition>({ required: true })
defineEmits<{ remove: [] }>()

const kind = computed(() => fieldKind(condition.value.field, props.customFieldDefinitions))
const operators = computed(() => OPERATORS_BY_KIND[kind.value])

function onFieldUpdate(field: string) {
  const kindForField = fieldKind(field, props.customFieldDefinitions)
  const operatorStillValid = OPERATORS_BY_KIND[kindForField].some(
    (o) => o.operator === condition.value.operator
  )
  condition.value = {
    field,
    operator: operatorStillValid
      ? condition.value.operator
      : OPERATORS_BY_KIND[kindForField][0].operator,
    value: condition.value.value,
  }
}

function onOperatorChange(operator: SegmentOperator) {
  condition.value = {
    ...condition.value,
    operator,
    value: operatorNeedsValue(operator) ? condition.value.value : undefined,
  }
}

function onValueInput(raw: string) {
  if (operatorNeedsListValue(condition.value.operator)) {
    condition.value = {
      ...condition.value,
      value: raw
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    }
  } else {
    condition.value = { ...condition.value, value: raw }
  }
}

const valueAsText = computed(() => {
  const value = condition.value.value
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined ? '' : String(value)
})

const selectedTagIds = computed(() => {
  const value = condition.value.value
  return Array.isArray(value) ? value.map(Number) : []
})

function onTagToggle(tagId: number, checked: boolean) {
  const next = checked
    ? [...selectedTagIds.value, tagId]
    : selectedTagIds.value.filter((id) => id !== tagId)
  condition.value = { ...condition.value, value: next }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-box border border-base-200 p-2">
    <FieldPicker
      :model-value="condition.field"
      :custom-field-definitions="customFieldDefinitions"
      @update:model-value="onFieldUpdate"
    />

    <select
      class="select select-bordered select-sm"
      :value="condition.operator"
      @change="onOperatorChange(($event.target as HTMLSelectElement).value as SegmentOperator)"
    >
      <option v-for="op in operators" :key="op.operator" :value="op.operator">
        {{ op.label }}
      </option>
    </select>

    <template v-if="operatorNeedsValue(condition.operator)">
      <div v-if="kind === 'tags'" class="flex flex-wrap gap-2">
        <label v-for="tag in tags" :key="tag.id" class="label cursor-pointer gap-1 py-0">
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            :checked="selectedTagIds.includes(tag.id)"
            @change="onTagToggle(tag.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="label-text text-xs">{{ tag.name }}</span>
        </label>
        <span v-if="tags.length === 0" class="text-xs opacity-60"
          >No tags in this project yet.</span
        >
      </div>
      <select
        v-else-if="kind === 'enum'"
        class="select select-bordered select-sm"
        :value="condition.value"
        @change="onValueInput(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="status in CONTACT_STATUSES" :key="status" :value="status">
          {{ status }}
        </option>
      </select>
      <select
        v-else-if="kind === 'boolean' && !operatorNeedsListValue(condition.operator)"
        class="select select-bordered select-sm"
        :value="condition.value"
        @change="onValueInput(($event.target as HTMLSelectElement).value)"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
      <input
        v-else-if="kind === 'number' && !operatorNeedsListValue(condition.operator)"
        type="number"
        class="input input-bordered input-sm"
        :value="valueAsText"
        @input="onValueInput(($event.target as HTMLInputElement).value)"
      />
      <input
        v-else-if="kind === 'date' && !operatorNeedsListValue(condition.operator)"
        type="date"
        class="input input-bordered input-sm"
        :value="valueAsText"
        @input="onValueInput(($event.target as HTMLInputElement).value)"
      />
      <input
        v-else
        type="text"
        class="input input-bordered input-sm"
        :placeholder="operatorNeedsListValue(condition.operator) ? 'value1, value2, ...' : 'value'"
        :value="valueAsText"
        @input="onValueInput(($event.target as HTMLInputElement).value)"
      />
    </template>

    <button type="button" class="btn btn-ghost btn-xs" @click="$emit('remove')">Remove</button>
  </div>
</template>
