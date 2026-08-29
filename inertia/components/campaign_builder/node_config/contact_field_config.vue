<script setup lang="ts">
import { computed } from 'vue'
import FieldPicker from '~/components/segment_builder/field_picker.vue'
import {
  OPERATORS_BY_KIND,
  fieldKind,
  operatorNeedsValue,
  type SegmentOperator,
} from '~/types/segment_definition'

const config = defineModel<any>({ required: true })

const field = computed({
  get: () => config.value.field ?? 'email',
  set: (value: string) => {
    const kind = fieldKind(value)
    config.value = { ...config.value, field: value, operator: OPERATORS_BY_KIND[kind][0].operator }
  },
})

const operators = computed(() => OPERATORS_BY_KIND[fieldKind(field.value)])

function onOperatorChange(operator: SegmentOperator) {
  config.value = {
    ...config.value,
    operator,
    value: operatorNeedsValue(operator) ? config.value.value : undefined,
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="form-control">
      <span class="label-text mb-1">Field</span>
      <FieldPicker v-model="field" />
    </label>

    <label class="form-control">
      <span class="label-text mb-1">Operator</span>
      <select
        class="select select-bordered select-sm"
        :value="config.operator"
        @change="onOperatorChange(($event.target as HTMLSelectElement).value as SegmentOperator)"
      >
        <option v-for="o in operators" :key="o.operator" :value="o.operator">{{ o.label }}</option>
      </select>
    </label>

    <label v-if="operatorNeedsValue(config.operator)" class="form-control">
      <span class="label-text mb-1">Value</span>
      <input
        type="text"
        class="input input-bordered input-sm"
        :value="config.value ?? ''"
        @input="config = { ...config, value: ($event.target as HTMLInputElement).value }"
      />
    </label>
  </div>
</template>
