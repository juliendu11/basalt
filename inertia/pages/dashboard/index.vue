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
  period: string
  summary: {
    from: string
    to: string
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
    contactsTotal: number
    contactsActive: number
  }
  timeSeries: Array<{
    date: string
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    unsubscribed: number
  }>
}>()

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
</script>

<template>
  <Head title="Dashboard" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <PeriodSelector :period="period" />

    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Contacts" :value="props.summary.contactsTotal" />
      <MetricCard label="Active contacts" :value="props.summary.contactsActive" />
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
      <MetricCard label="Unsubscribed" :value="props.summary.unsubscribed" />
    </div>

    <h2 class="mb-2 text-lg font-semibold">Activity over time</h2>
    <TimeSeriesChart :series="props.timeSeries" />
  </div>
</template>
