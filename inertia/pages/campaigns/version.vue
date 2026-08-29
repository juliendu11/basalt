<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  campaign: { id: number; name: string }
  version: { id: number; versionNumber: number; status: string; publishedAt: string | null }

  graph: { nodes: any[]; edges: any[] }
}>()

const routeParams = {
  organizationId: props.project.organizationId,
  projectId: props.project.id,
  campaignId: props.campaign.id,
}
</script>

<template>
  <Head :title="`${campaign.name} — v${version.versionNumber}`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold">
        {{ campaign.name }} — version #{{ version.versionNumber }} ({{ version.status }})
      </h1>
      <Link class="btn btn-sm" route="campaigns.show" :params="routeParams">Back to campaign</Link>
    </div>

    <p class="mb-4 text-sm opacity-60">
      Read-only — this is a past version's frozen graph, it cannot be edited.
    </p>

    <div class="rounded-box border border-base-200 p-4">
      <p class="mb-3 text-sm font-semibold">
        {{ graph.nodes.length }} nodes, {{ graph.edges.length }} edges
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="node in graph.nodes"
          :key="node.clientKey"
          class="rounded-box border border-base-200 p-2 text-sm"
        >
          <span class="font-medium">{{ node.type }}</span> / {{ node.subtype }}
        </li>
      </ul>
    </div>
  </div>
</template>
