<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Head, router } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import Canvas from '~/components/campaign_builder/canvas.vue'
import NodePalette from '~/components/campaign_builder/node_palette.vue'
import NodeConfigPanel from '~/components/campaign_builder/node_config_panel.vue'
import { csrfHeaders } from '~/utils/csrf'
import {
  toVueFlowElements,
  fromVueFlowElements,
  type GraphNode,
  type GraphEdge,
} from '~/lib/campaign_graph_mapper'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  campaign: { id: number; name: string; status: string }
  versionId: number
  readonly: boolean
  versions: {
    id: number
    versionNumber: number
    status: string
    publishedAt: string | null
  }[]
  // `any` at the config leaf mirrors the transformer's own escape hatch —
  // see inertia_props_unknown_type_never in the memory system.

  graph: { nodes: any[]; edges: any[] }
  emails: { id: number; name: string }[]
  segments: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  smtpConnectors: { id: number; name: string }[]
}>()

const routeParams = {
  organizationId: props.project.organizationId,
  projectId: props.project.id,
  campaignId: props.campaign.id,
}

function onSelectVersion(event: Event) {
  const versionId = (event.target as HTMLSelectElement).value
  router.visit(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/campaigns/${props.campaign.id}/builder?versionId=${versionId}`
  )
}

const initial = toVueFlowElements(props.graph.nodes, props.graph.edges)
// `shallowRef` (not `ref`) — Vue Flow's `Node`/`Edge` types contain
// internal measurement/state objects that are unfriendly to Vue's deep
// `UnwrapRef`, which also triggered a `TS2589: Type instantiation is
// excessively deep` error under vue-tsc; array contents are always
// replaced wholesale below rather than mutated in place, so `shallowRef`
// is both the fix and the more correct choice here.
const nodes = shallowRef<GraphNode[]>(initial.nodes)
const edges = shallowRef<GraphEdge[]>(initial.edges)
const selectedClientKey = shallowRef<string | null>(null)

const selectedNode = computed(
  () => nodes.value.find((n: GraphNode) => n.id === selectedClientKey.value) ?? null
)

const sendEmailNodes = computed(() =>
  nodes.value
    .filter((n: GraphNode) => n.data!.subtype === 'send_email')
    .map((n: GraphNode) => ({
      clientKey: n.id,
      label: `${n.id} (email #${n.data!.config?.emailId ?? '?'})`,
    }))
)

function onSelectNode(clientKey: string | null) {
  selectedClientKey.value = clientKey
}

function addNode(type: string, subtype: string) {
  if (props.readonly) return
  const clientKey = crypto.randomUUID()
  nodes.value = [
    ...nodes.value,
    {
      id: clientKey,
      type: 'campaignNode',
      position: { x: 100 + nodes.value.length * 30, y: 100 + nodes.value.length * 30 },
      data: { type, subtype, config: {} },
    },
  ]
  selectedClientKey.value = clientKey
}

function removeSelectedNode() {
  if (props.readonly || !selectedClientKey.value) return
  const key = selectedClientKey.value
  nodes.value = nodes.value.filter((n: GraphNode) => n.id !== key)
  edges.value = edges.value.filter((e: GraphEdge) => e.source !== key && e.target !== key)
  selectedClientKey.value = null
}

function updateConfig(config: unknown) {
  if (props.readonly || !selectedNode.value) return
  const key = selectedNode.value.id
  nodes.value = nodes.value.map((n: GraphNode) =>
    n.id === key ? { ...n, data: { ...n.data!, config } } : n
  )
}

const saveState = shallowRef<'idle' | 'saving' | 'error'>('idle')

// The only way a draft version gets created for this campaign — the
// backend clones one from the published version on save if none exists
// yet (CampaignBuildersController#save), so merely opening the builder and
// navigating away never creates a draft.
async function save() {
  if (props.readonly) return
  saveState.value = 'saving'
  const payload = fromVueFlowElements(nodes.value, edges.value)

  try {
    const response = await fetch(
      `/organizations/${props.project.organizationId}/projects/${props.project.id}/campaigns/${props.campaign.id}/builder`,
      {
        method: 'PUT',
        headers: {
          ...csrfHeaders(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      saveState.value = 'error'
      return
    }

    router.visit(
      `/organizations/${props.project.organizationId}/projects/${props.project.id}/campaigns/${props.campaign.id}`
    )
  } catch {
    saveState.value = 'error'
  }
}
</script>

<template>
  <Head :title="`${campaign.name} — Builder`" />

  <div class="mx-auto max-w-7xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">{{ campaign.name }}</h1>
        <p class="text-xs opacity-60">
          <span v-if="readonly">Viewing a past version — read-only</span>
          <span v-else-if="saveState === 'saving'">Saving...</span>
          <span v-else-if="saveState === 'error'">Save failed — try again</span>
          <span v-else>Changes are only kept when you press Save</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select class="select select-sm" :value="versionId" @change="onSelectVersion">
          <option v-for="v in versions" :key="v.id" :value="v.id">
            #{{ v.versionNumber }} — {{ v.status }}
          </option>
        </select>
        <Link
          class="btn btn-sm"
          route="campaigns.show"
          :params="{
            organizationId: project.organizationId,
            projectId: project.id,
            campaignId: campaign.id,
          }"
        >
          Back to campaign
        </Link>
        <Form
          v-if="readonly"
          method="post"
          route="campaigns.versions.restore"
          :params="{ ...routeParams, versionId }"
        >
          <button type="submit" class="btn btn-primary btn-sm">Restore this version</button>
        </Form>
        <button
          v-else
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="saveState === 'saving'"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>

    <div class="flex gap-4">
      <fieldset :disabled="readonly">
        <NodePalette @add="addNode" />
      </fieldset>

      <Canvas
        v-model:nodes="nodes"
        v-model:edges="edges"
        class="flex-1"
        :readonly="readonly"
        :emails="emails"
        @select-node="onSelectNode"
      />

      <div class="w-72 rounded-box border border-base-200 p-3">
        <template v-if="selectedNode">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ selectedNode.data!.subtype }}</h3>
            <button
              v-if="!readonly"
              type="button"
              class="btn btn-ghost btn-xs"
              @click="removeSelectedNode"
            >
              Delete
            </button>
          </div>
          <fieldset :disabled="readonly">
            <NodeConfigPanel
              :subtype="selectedNode.data!.subtype"
              :config="selectedNode.data!.config"
              :emails="emails"
              :segments="segments"
              :tags="tags"
              :smtp-connectors="smtpConnectors"
              :send-email-nodes="sendEmailNodes"
              @update:config="updateConfig"
            />
          </fieldset>
        </template>
        <p v-else class="text-sm opacity-60">Select a node to configure it.</p>
      </div>
    </div>
  </div>
</template>
