<script setup lang="ts">
const emit = defineEmits<{ add: [type: string, subtype: string] }>()

const PALETTE: { type: string; subtype: string; label: string }[] = [
  { type: 'source', subtype: 'segment', label: 'Segment source' },
  { type: 'action', subtype: 'send_email', label: 'Send email' },
  { type: 'action', subtype: 'wait', label: 'Wait' },
  { type: 'action', subtype: 'add_tag', label: 'Add tag' },
  { type: 'action', subtype: 'remove_tag', label: 'Remove tag' },
  { type: 'action', subtype: 'add_to_segment', label: 'Add to segment' },
  { type: 'action', subtype: 'remove_from_segment', label: 'Remove from segment' },
  { type: 'condition', subtype: 'contact_field', label: 'If contact field' },
  { type: 'condition', subtype: 'in_segment', label: 'If in segment' },
  { type: 'condition', subtype: 'email_opened', label: 'If email opened' },
  { type: 'condition', subtype: 'email_clicked', label: 'If email clicked' },
]
</script>

<template>
  <div class="flex w-56 flex-col gap-2 rounded-box border border-base-200 p-3">
    <h3 class="text-sm font-semibold opacity-70">Add a node</h3>
    <button
      v-for="item in PALETTE"
      :key="item.subtype"
      type="button"
      class="btn btn-sm btn-outline justify-start"
      @click="emit('add', item.type, item.subtype)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
