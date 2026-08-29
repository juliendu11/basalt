<script setup lang="ts">
import { computed } from 'vue'

interface Point {
  date: string
  sent: number
  opened: number
  clicked: number
}

const props = defineProps<{ series: Point[] }>()

// Hand-rolled SVG line chart — no charting library is installed in this
// project (docs/plans/18-statistics-dashboard.md doesn't mandate one), and
// this page's only chart need is a simple multi-line time series, not
// worth a new dependency for.
const WIDTH = 600
const HEIGHT = 160
const PADDING = 24

const maxValue = computed(() =>
  Math.max(1, ...props.series.flatMap((p) => [p.sent, p.opened, p.clicked]))
)

function points(key: 'sent' | 'opened' | 'clicked'): string {
  const n = props.series.length
  if (n === 0) return ''
  return props.series
    .map((point, i) => {
      const x = n === 1 ? PADDING : PADDING + (i / (n - 1)) * (WIDTH - 2 * PADDING)
      const y = HEIGHT - PADDING - (point[key] / maxValue.value) * (HEIGHT - 2 * PADDING)
      return `${x},${y}`
    })
    .join(' ')
}
</script>

<template>
  <div
    v-if="series.length === 0"
    class="rounded-box border border-base-200 p-8 text-center opacity-60"
  >
    No data yet for this period.
  </div>
  <svg v-else :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="w-full">
    <polyline
      :points="points('sent')"
      fill="none"
      stroke="currentColor"
      class="text-base-content/40"
      stroke-width="2"
    />
    <polyline
      :points="points('opened')"
      fill="none"
      stroke="currentColor"
      class="text-info"
      stroke-width="2"
    />
    <polyline
      :points="points('clicked')"
      fill="none"
      stroke="currentColor"
      class="text-success"
      stroke-width="2"
    />
  </svg>
  <div v-if="series.length > 0" class="mt-2 flex gap-4 text-xs opacity-70">
    <span class="flex items-center gap-1"
      ><span class="h-2 w-2 rounded-full bg-base-content/40"></span> Sent</span
    >
    <span class="flex items-center gap-1"
      ><span class="h-2 w-2 rounded-full bg-info"></span> Opened</span
    >
    <span class="flex items-center gap-1"
      ><span class="h-2 w-2 rounded-full bg-success"></span> Clicked</span
    >
  </div>
</template>
