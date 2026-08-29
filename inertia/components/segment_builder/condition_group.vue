<script setup lang="ts">
import ConditionRow from '~/components/segment_builder/condition_row.vue'
import {
  isConditionGroup,
  type CustomFieldDefinitionOption,
  type SegmentConditionGroup,
  type SegmentNode,
  type TagOption,
} from '~/types/segment_definition'

const props = withDefaults(
  defineProps<{
    depth?: number
    customFieldDefinitions?: CustomFieldDefinitionOption[]
    tags?: TagOption[]
  }>(),
  { depth: 0, customFieldDefinitions: () => [], tags: () => [] }
)
const group = defineModel<SegmentConditionGroup>({ required: true })

function updateCombinator(combinator: 'AND' | 'OR') {
  group.value = { ...group.value, combinator }
}

function updateNode(index: number, node: SegmentNode) {
  const conditions = [...group.value.conditions]
  conditions[index] = node
  group.value = { ...group.value, conditions }
}

function removeNode(index: number) {
  group.value = { ...group.value, conditions: group.value.conditions.filter((_, i) => i !== index) }
}

function addCondition() {
  group.value = {
    ...group.value,
    conditions: [...group.value.conditions, { field: 'email', operator: 'equals', value: '' }],
  }
}

function addGroup() {
  group.value = {
    ...group.value,
    conditions: [...group.value.conditions, { combinator: 'AND', conditions: [] }],
  }
}
</script>

<template>
  <div
    class="rounded-box border border-base-300 p-3"
    :class="{ 'bg-base-200/40': props.depth > 0 }"
  >
    <div class="mb-2 flex items-center gap-2">
      <span class="text-sm opacity-70">Match</span>
      <select
        class="select select-bordered select-xs"
        :value="group.combinator"
        @change="updateCombinator(($event.target as HTMLSelectElement).value as 'AND' | 'OR')"
      >
        <option value="AND">all</option>
        <option value="OR">any</option>
      </select>
      <span class="text-sm opacity-70">of the following</span>
    </div>

    <div class="flex flex-col gap-2">
      <div v-for="(node, index) in group.conditions" :key="index">
        <ConditionGroup
          v-if="isConditionGroup(node)"
          :model-value="node"
          :depth="props.depth + 1"
          :custom-field-definitions="props.customFieldDefinitions"
          :tags="props.tags"
          @update:model-value="(updated: SegmentNode) => updateNode(index, updated)"
        />
        <ConditionRow
          v-else
          :model-value="node"
          :custom-field-definitions="props.customFieldDefinitions"
          :tags="props.tags"
          @update:model-value="(updated: SegmentNode) => updateNode(index, updated)"
          @remove="removeNode(index)"
        />
        <button
          v-if="isConditionGroup(node)"
          type="button"
          class="btn btn-ghost btn-xs mt-1"
          @click="removeNode(index)"
        >
          Remove group
        </button>
      </div>
      <p v-if="group.conditions.length === 0" class="text-sm opacity-60">
        No conditions — matches every contact of the project.
      </p>
    </div>

    <div class="mt-2 flex gap-2">
      <button type="button" class="btn btn-xs" @click="addCondition">+ Condition</button>
      <button v-if="props.depth < 4" type="button" class="btn btn-xs" @click="addGroup">
        + Group
      </button>
    </div>
  </div>
</template>
