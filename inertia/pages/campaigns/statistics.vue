<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import MetricCard from '~/components/statistics/metric_card.vue'
import PeriodSelector from '~/components/statistics/period_selector.vue'
import TimeSeriesChart from '~/components/statistics/time_series_chart.vue'
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
  period: string
  summary: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    unsubscribed: number
    openRate: number
    clickRate: number
    bounceRate: number
  }
  timeSeries: Array<{ date: string; sent: number; opened: number; clicked: number }>
  nodePerformance: Array<{
    nodeId: number
    subject: string | null
    sent: number
    opened: number
    clicked: number
    openRate: number
    clickRate: number
  }>
}>()

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
</script>

<template>
  <Head :title="`${props.campaign.name} — Statistics`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <h2 class="mb-4 text-xl font-semibold">{{ props.campaign.name }} — Statistics</h2>

    <PeriodSelector :period="period" />

    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Sent" :value="props.summary.sent" />
      <MetricCard label="Delivered" :value="props.summary.delivered" />
      <MetricCard
        label="Opened"
        :value="props.summary.opened"
        :hint="pct(props.summary.openRate)"
      />
      <MetricCard
        label="Clicked"
        :value="props.summary.clicked"
        :hint="pct(props.summary.clickRate)"
      />
      <MetricCard
        label="Bounced"
        :value="props.summary.bounced"
        :hint="pct(props.summary.bounceRate)"
      />
      <MetricCard label="Failed" :value="props.summary.failed" />
      <MetricCard label="Unsubscribed" :value="props.summary.unsubscribed" />
    </div>

    <h3 class="mb-2 text-lg font-semibold">Activity over time</h3>
    <TimeSeriesChart :series="props.timeSeries" />

    <h3 class="mb-2 mt-8 text-lg font-semibold">Performance by email</h3>
    <div
      v-if="props.nodePerformance.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-60"
    >
      No emails sent by this campaign yet.
    </div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Sent</th>
          <th>Open rate</th>
          <th>Click rate</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="node in props.nodePerformance" :key="node.nodeId">
          <td>{{ node.subject ?? '—' }}</td>
          <td>{{ node.sent }}</td>
          <td>{{ pct(node.openRate) }}</td>
          <td>{{ pct(node.clickRate) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
