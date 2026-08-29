<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Head, useForm } from '@inertiajs/vue3'
import ConditionGroup from '~/components/segment_builder/condition_group.vue'
import { csrfHeaders } from '~/utils/csrf'
import type { SegmentConditionGroup } from '~/types/segment_definition'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  // `any[]`, not `CustomFieldDefinitionOption[]` — an imported prop type
  // here collapses this page's whole inertia.render() argument to `never`
  // (see inertia_props_unknown_type_never in the memory system).
  customFieldDefinitions: any[]
  tags: any[]
}>()

const definition = ref<SegmentConditionGroup>({ combinator: 'AND', conditions: [] })

// `definition` is deliberately NOT one of useForm()'s tracked fields —
// its internal FormDataType mapped type cannot handle a genuinely
// recursive type (errors with a circular-reference TS2615). Instead it's
// attached at submit time via `.transform()`, whose callback return type
// is just `object` (no FormDataConvertible constraint), and read back from
// `form.errors` via a loose cast since it isn't a key of TForm either.
const form = useForm({ name: '', description: '' }).transform((data) => ({
  ...data,
  definition: definition.value,
}))

const definitionError = () => (form.errors as Record<string, string | undefined>).definition

function submit() {
  form.post(`/organizations/${props.project.organizationId}/projects/${props.project.id}/segments`)
}

const previewCount = ref<number | null>(null)
const previewMessage = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

async function fetchPreview() {
  const response = await fetch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/segments/preview`,
    {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ definition: definition.value }),
    }
  )
  const body = await response.json()
  previewCount.value = body.count
  previewMessage.value = body.message ?? null
}

watch(
  definition,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(fetchPreview, 400)
  },
  { deep: true, immediate: true }
)

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <Head title="New segment" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New segment</h1>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          v-model="form.name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': form.errors.name }"
          autofocus
        />
        <span v-if="form.errors.name" class="mt-1 text-sm text-error">{{ form.errors.name }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Description (optional)</span>
        <input v-model="form.description" type="text" class="input input-bordered w-full" />
      </label>

      <div>
        <span class="label-text mb-1">Conditions</span>
        <ConditionGroup
          v-model="definition"
          :custom-field-definitions="customFieldDefinitions"
          :tags="tags"
        />
        <span v-if="definitionError()" class="mt-1 block text-sm text-error">
          {{ definitionError() }}
        </span>
      </div>

      <div class="rounded-box bg-base-200 p-3 text-sm">
        <span v-if="previewCount !== null"
          >Matches approximately {{ previewCount }} contact(s).</span
        >
        <span v-else-if="previewMessage" class="opacity-70">{{ previewMessage }}</span>
        <span v-else class="opacity-70">Computing preview…</span>
      </div>

      <button type="submit" class="btn btn-primary self-start" :disabled="form.processing">
        Create segment
      </button>
    </form>
  </div>
</template>
