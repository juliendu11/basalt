<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  organization: { id: number; name: string; slug: string }
}>()

const timezones = Intl.supportedValuesOf('timeZone')
const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
</script>

<template>
  <Head title="New project" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-8 text-2xl font-semibold">Create a project</h1>
    <p class="mb-6 text-sm opacity-70">
      A project isolates the contacts, campaigns and other marketing data of one workspace within
      {{ organization.name }}.
    </p>

    <Form
      v-slot="{ processing, errors }"
      route="projects.store"
      :params="{ organizationId: props.organization.id }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
          autofocus
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Timezone</span>
        <select
          name="timezone"
          class="select select-bordered w-full"
          :class="{ 'select-error': errors.timezone }"
          :value="defaultTimezone"
        >
          <option v-for="timezone in timezones" :key="timezone" :value="timezone">
            {{ timezone }}
          </option>
        </select>
        <span v-if="errors.timezone" class="mt-1 text-sm text-error">{{ errors.timezone }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Image (optional)</span>
        <input
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="file-input file-input-bordered w-full"
          :class="{ 'file-input-error': errors.image }"
        />
        <span v-if="errors.image" class="mt-1 text-sm text-error">{{ errors.image }}</span>
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-1">
          <span class="label-text mb-1">Default sender name (optional)</span>
          <input
            name="defaultSenderName"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.defaultSenderName }"
          />
          <span v-if="errors.defaultSenderName" class="mt-1 text-sm text-error">
            {{ errors.defaultSenderName }}
          </span>
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">Default sender email (optional)</span>
          <input
            name="defaultSenderEmail"
            type="email"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.defaultSenderEmail }"
          />
          <span v-if="errors.defaultSenderEmail" class="mt-1 text-sm text-error">
            {{ errors.defaultSenderEmail }}
          </span>
        </label>
      </div>
      <p class="-mt-3 text-xs opacity-60">
        Used to pre-fill the sender name and email when creating a new email in this project.
      </p>

      <button type="submit" class="btn btn-primary" :disabled="processing">Create project</button>
    </Form>
  </div>
</template>
