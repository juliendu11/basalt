<script setup lang="ts">
import { reactive } from 'vue'
import { Head, useForm } from '@inertiajs/vue3'

const props = defineProps<{
  contact: {
    id: number
    projectId: number
    email: string
    firstName: string | null
    lastName: string | null
    phone: string | null
    company: string | null
    country: string | null
    city: string | null
    language: string | null
    // `any`, not `Record<...>` — a nested Record/unknown anywhere in a page's
    // props collapses the whole inertia.render() argument type to `never`
    // (see inertia_props_unknown_type_never in the memory system).
    customFields: any
  }
  project: { id: number; organizationId: number; name: string; slug: string }
  customFieldDefinitions: Array<{
    id: number
    key: string
    label: string
    type: 'text' | 'number' | 'boolean' | 'date'
  }>
}>()

// Reactive object always including every defined key (pre-filled from the
// contact's existing value when present) — see contacts/create.vue for why
// this is required instead of native form fields (unchecked checkboxes).
const customFields = reactive<Record<string, string | number | boolean>>(
  Object.fromEntries(
    props.customFieldDefinitions.map((definition) => {
      const existing = props.contact.customFields?.[definition.key]
      if (existing !== undefined && existing !== null) return [definition.key, existing]
      return [definition.key, definition.type === 'boolean' ? false : '']
    })
  )
)

const form = useForm({
  email: props.contact.email,
  firstName: props.contact.firstName ?? '',
  lastName: props.contact.lastName ?? '',
  phone: props.contact.phone ?? '',
  company: props.contact.company ?? '',
  country: props.contact.country ?? '',
  city: props.contact.city ?? '',
  language: props.contact.language ?? '',
}).transform((data) => ({ ...data, customFields }))

function submit() {
  form.patch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/contacts/${props.contact.id}`
  )
}
</script>

<template>
  <Head title="Edit contact" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">Edit contact</h1>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="form-control">
        <span class="label-text mb-1">Email</span>
        <input
          v-model="form.email"
          type="email"
          class="input input-bordered w-full"
          :class="{ 'input-error': form.errors.email }"
        />
        <span v-if="form.errors.email" class="mt-1 text-sm text-error">
          {{ form.errors.email }}
        </span>
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-1">
          <span class="label-text mb-1">First name</span>
          <input v-model="form.firstName" type="text" class="input input-bordered w-full" />
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">Last name</span>
          <input v-model="form.lastName" type="text" class="input input-bordered w-full" />
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Phone</span>
        <input v-model="form.phone" type="text" class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Company</span>
        <input v-model="form.company" type="text" class="input input-bordered w-full" />
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-1">
          <span class="label-text mb-1">Country</span>
          <input v-model="form.country" type="text" class="input input-bordered w-full" />
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">City</span>
          <input v-model="form.city" type="text" class="input input-bordered w-full" />
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Language (ISO 639-1)</span>
        <input
          v-model="form.language"
          type="text"
          maxlength="2"
          class="input input-bordered w-full"
          :class="{ 'input-error': form.errors.language }"
        />
        <span v-if="form.errors.language" class="mt-1 text-sm text-error">
          {{ form.errors.language }}
        </span>
      </label>

      <template v-if="customFieldDefinitions.length > 0">
        <div class="divider">Custom fields</div>

        <label
          v-for="definition in customFieldDefinitions"
          :key="definition.id"
          class="form-control"
        >
          <span class="label-text mb-1">{{ definition.label }}</span>
          <input
            v-if="definition.type === 'text'"
            v-model="customFields[definition.key]"
            type="text"
            class="input input-bordered w-full"
          />
          <input
            v-else-if="definition.type === 'number'"
            v-model.number="customFields[definition.key]"
            type="number"
            class="input input-bordered w-full"
          />
          <input
            v-else-if="definition.type === 'date'"
            v-model="customFields[definition.key]"
            type="date"
            class="input input-bordered w-full"
          />
          <input v-else v-model="customFields[definition.key]" type="checkbox" class="checkbox" />
        </label>
      </template>

      <button type="submit" class="btn btn-primary" :disabled="form.processing">Save</button>
    </form>
  </div>
</template>
