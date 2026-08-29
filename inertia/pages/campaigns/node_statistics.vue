<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import MetricCard from '~/components/statistics/metric_card.vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  campaign: { id: number; name: string; status: string }
  node: {
    nodeId: number
    subject: string | null
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    openRate: number
    clickRate: number
  }
}>()

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
</script>

<template>
  <Head :title="props.node.subject ?? 'Email statistics'" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <h2 class="mb-1 text-xl font-semibold">{{ props.campaign.name }}</h2>
    <p class="mb-6 opacity-70">{{ props.node.subject ?? 'Untitled email' }}</p>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <MetricCard label="Sent" :value="props.node.sent" />
      <MetricCard label="Delivered" :value="props.node.delivered" />
      <MetricCard label="Opened" :value="props.node.opened" :hint="pct(props.node.openRate)" />
      <MetricCard label="Clicked" :value="props.node.clicked" :hint="pct(props.node.clickRate)" />
      <MetricCard label="Bounced" :value="props.node.bounced" />
      <MetricCard label="Failed" :value="props.node.failed" />
    </div>
  </div>
</template>
