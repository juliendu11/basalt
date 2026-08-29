<script setup lang="ts">
import { computed } from 'vue'
import SendEmailConfig from '~/components/campaign_builder/node_config/send_email_config.vue'
import WaitConfig from '~/components/campaign_builder/node_config/wait_config.vue'
import TagConfig from '~/components/campaign_builder/node_config/tag_config.vue'
import SegmentConfig from '~/components/campaign_builder/node_config/segment_config.vue'
import ContactFieldConfig from '~/components/campaign_builder/node_config/contact_field_config.vue'
import ReferenceNodeConfig from '~/components/campaign_builder/node_config/reference_node_config.vue'

const props = defineProps<{
  subtype: string

  config: any
  emails: { id: number; name: string }[]
  segments: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  smtpConnectors: { id: number; name: string }[]
  sendEmailNodes: { clientKey: string; label: string }[]
}>()

const emit = defineEmits<{ 'update:config': [config: unknown] }>()

const model = computed({
  get: () => props.config,
  set: (value) => emit('update:config', value),
})

const SEGMENT_SUBTYPES = new Set(['segment', 'add_to_segment', 'remove_from_segment', 'in_segment'])
const TAG_SUBTYPES = new Set(['add_tag', 'remove_tag'])
const REFERENCE_SUBTYPES = new Set(['email_opened', 'email_clicked'])
</script>

<template>
  <SendEmailConfig
    v-if="subtype === 'send_email'"
    v-model="model"
    :emails="emails"
    :smtp-connectors="smtpConnectors"
  />
  <WaitConfig v-else-if="subtype === 'wait'" v-model="model" />
  <TagConfig v-else-if="TAG_SUBTYPES.has(subtype)" v-model="model" :tags="tags" />
  <SegmentConfig v-else-if="SEGMENT_SUBTYPES.has(subtype)" v-model="model" :segments="segments" />
  <ContactFieldConfig v-else-if="subtype === 'contact_field'" v-model="model" />
  <ReferenceNodeConfig
    v-else-if="REFERENCE_SUBTYPES.has(subtype)"
    v-model="model"
    :send-email-nodes="sendEmailNodes"
  />
  <p v-else class="text-sm opacity-60">
    This node type ({{ subtype }}) has no configuration in v1 — it's accepted by the graph but not
    executed by the campaign engine yet.
  </p>
</template>
