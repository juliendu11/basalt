<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { Head, router, useForm } from '@inertiajs/vue3'
import ConditionGroup from '~/components/segment_builder/condition_group.vue'
import { csrfHeaders } from '~/utils/csrf'
import type { SegmentConditionGroup } from '~/types/segment_definition'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  // `any[]`, not `CustomFieldDefinitionOption[]` — same `never`-collapse
  // workaround as create.vue.
  customFieldDefinitions: any[]
  tags: any[]
  segment: {
    id: number
    name: string
    description: string | null
    // `conditions: any[]` (not `unknown[]`, not the recursive
    // SegmentConditionGroup) — this specific Adonis Inertia page-props
    // typing machinery (PagePropsEagerDataTypes) resolves the whole prop
    // type to `never` when a nested prop uses `unknown`/`object`/`Record`
    // anywhere in its shape, or a genuinely recursive named type; `any`
    // alone was confirmed (by bisection) to be the one escape hatch that
    // doesn't trigger it. Cast to the real recursive type right below.
    definition: { combinator: 'AND' | 'OR'; conditions: any[] }
    contactCountCache: number
    lastComputationStatus: 'idle' | 'running' | 'success' | 'failed'
  }
}>()

// `toRaw()` first — `props.segment.definition` is a Vue reactive Proxy, and
// `structuredClone()` refuses to clone a Proxy directly ("DOMException:
// Proxy object could not be cloned"), even though its target is plain data.
const definition = ref<SegmentConditionGroup>(
  structuredClone(toRaw(props.segment.definition) as SegmentConditionGroup)
)

// See create.vue for why `definition` is deliberately NOT one of useForm()'s
// tracked fields (its FormDataType mapped type can't handle genuine
// recursion — TS2615) — attached at submit time via `.transform()` instead.
const form = useForm({
  name: props.segment.name,
  description: props.segment.description ?? '',
}).transform((data) => ({ ...data, definition: definition.value }))

const definitionError = () => (form.errors as Record<string, string | undefined>).definition

function submit() {
  form.patch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/segments/${props.segment.id}`
  )
}

function recomputeNow() {
  router.post(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/segments/${props.segment.id}/recompute`
  )
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
  <Head title="Edit segment" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">Edit segment</h1>
      <button type="button" class="btn btn-sm" @click="recomputeNow">Recompute now</button>
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          v-model="form.name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': form.errors.name }"
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
        Save
      </button>
    </form>
  </div>
</template>
