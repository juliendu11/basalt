<script setup lang="ts">
import { reactive } from 'vue'
import { Head, useForm } from '@inertiajs/vue3'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  customFieldDefinitions: Array<{
    id: number
    key: string
    label: string
    type: 'text' | 'number' | 'boolean' | 'date'
  }>
}>()

// A reactive object built from the project's custom field definitions,
// always including every key regardless of input state (in particular an
// unchecked boolean checkbox) — see contacts/edit.vue for why this can't be
// a native HTML form field. Attached at submit time via `.transform()`, same
// pattern as `definition` in segments/create.vue.
const customFields = reactive<Record<string, string | number | boolean>>(
  Object.fromEntries(
    props.customFieldDefinitions.map((definition) => [
      definition.key,
      definition.type === 'boolean' ? false : '',
    ])
  )
)

const form = useForm({
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  company: '',
  country: '',
  city: '',
  language: '',
}).transform((data) => ({ ...data, customFields }))

function submit() {
  form.post(`/organizations/${props.project.organizationId}/projects/${props.project.id}/contacts`)
}
</script>

<template>
  <Head title="New contact" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New contact</h1>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="form-control">
        <span class="label-text mb-1">Email</span>
        <input
          v-model="form.email"
          type="email"
          class="input input-bordered w-full"
          :class="{ 'input-error': form.errors.email }"
          autofocus
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
          placeholder="en"
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

      <button type="submit" class="btn btn-primary" :disabled="form.processing">
        Create contact
      </button>
    </form>
  </div>
</template>
