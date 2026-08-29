<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import GraphNodeComponent from '~/components/campaign_builder/graph_node.vue'
import type { GraphNode, GraphEdge } from '~/lib/campaign_graph_mapper'

const nodes = defineModel<GraphNode[]>('nodes', { required: true })
const edges = defineModel<GraphEdge[]>('edges', { required: true })

const props = withDefaults(
  defineProps<{ readonly?: boolean; emails?: { id: number; name: string }[] }>(),
  { readonly: false, emails: () => [] }
)

const emit = defineEmits<{ selectNode: [clientKey: string | null] }>()

const {
  onConnect,
  addEdges,
  onNodeClick,
  onPaneClick,
  onNodeDragStop,
  findNode,
  updateNodeInternals,
} = useVueFlow()

// Replacing a node's `data` (e.g. `updateConfig` in builder.vue swapping in
// a new config object) can leave Vue Flow's cached measurement in an
// unmeasured state — its `visibility: hidden` never clears because nothing
// actually resizes the DOM element afterward, so the browser's
// ResizeObserver has no size change to fire on. `updateNodeInternals()` is
// Vue Flow's own API for exactly this: force a remeasure after an external
// data update so the node doesn't stay invisible until a full reload.
watch(nodes, () => {
  nextTick(() => updateNodeInternals())
})

onConnect((connection) => {
  if (props.readonly) return
  addEdges([connection])
})

onNodeClick(({ node }) => {
  emit('selectNode', node.id)
})

onPaneClick(() => {
  emit('selectNode', null)
})

onNodeDragStop(({ node }) => {
  if (props.readonly) return
  const target = nodes.value.find((n) => n.id === node.id)
  if (target) target.position = node.position
})

defineExpose({ findNode })
</script>

<template>
  <div class="h-[70vh] w-full rounded-box border border-base-200">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      fit-view-on-init
      :nodes-draggable="!readonly"
      :nodes-connectable="!readonly"
      :edges-updatable="!readonly"
    >
      <template #node-campaignNode="nodeProps">
        <GraphNodeComponent
          :data="nodeProps.data"
          :selected="nodeProps.selected"
          :emails="emails"
        />
      </template>
    </VueFlow>
  </div>
</template>
