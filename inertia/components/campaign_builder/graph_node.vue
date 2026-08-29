<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const props = withDefaults(
  defineProps<{
    data: { type: string; subtype: string; config: Record<string, unknown> }
    selected?: boolean
    emails?: { id: number; name: string }[]
  }>(),
  { emails: () => [] }
)

const typeColor: Record<string, string> = {
  source: 'border-success',
  action: 'border-primary',
  condition: 'border-warning',
  trigger: 'border-neutral',
}

function summary(): string {
  const c = props.data.config ?? {}
  switch (props.data.subtype) {
    case 'wait':
      return `${c.durationValue ?? '?'} ${c.durationUnit ?? ''}`
    case 'send_email': {
      if (!c.emailId) return 'No email selected'
      const email = props.emails.find((e) => e.id === c.emailId)
      return email ? email.name : `Email #${c.emailId}`
    }
    case 'contact_field':
      return `${c.field ?? '?'} ${c.operator ?? ''}`
    default:
      return ''
  }
}
</script>

<template>
  <div
    class="min-w-40 rounded-box border-2 bg-base-100 px-3 py-2 shadow-sm"
    :class="[typeColor[data.type] ?? 'border-base-300', selected ? 'ring-2 ring-primary' : '']"
  >
    <Handle type="target" :position="Position.Top" />

    <div class="text-xs font-semibold uppercase opacity-60">{{ data.type }}</div>
    <div class="text-sm font-medium">{{ data.subtype }}</div>
    <div v-if="summary()" class="mt-1 text-xs opacity-70">{{ summary() }}</div>

    <template v-if="data.type === 'condition'">
      <Handle
        id="true"
        type="source"
        :position="Position.Bottom"
        style="left: 30%"
        class="!bg-success"
      />
      <Handle
        id="false"
        type="source"
        :position="Position.Bottom"
        style="left: 70%"
        class="!bg-error"
      />
    </template>
    <Handle v-else type="source" :position="Position.Bottom" />
  </div>
</template>
