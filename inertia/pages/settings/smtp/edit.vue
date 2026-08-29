<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  connector: {
    id: number
    name: string
    host: string
    port: number
    username: string
    encryption: 'none' | 'ssl' | 'tls'
    fromEmail: string
    fromName: string
    replyTo: string | null
    dailyLimit: number | null
  }
}>()
</script>

<template>
  <Head title="Edit SMTP connector" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">Edit SMTP connector</h1>

    <Form
      v-slot="{ processing, errors }"
      method="patch"
      route="smtp_connectors.update"
      :params="{
        organizationId: props.project.organizationId,
        projectId: props.project.id,
        connectorId: props.connector.id,
      }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
          :value="connector.name"
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-[3]">
          <span class="label-text mb-1">Host</span>
          <input
            name="host"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.host }"
            :value="connector.host"
          />
          <span v-if="errors.host" class="mt-1 text-sm text-error">{{ errors.host }}</span>
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">Port</span>
          <input
            name="port"
            type="number"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.port }"
            :value="connector.port"
          />
          <span v-if="errors.port" class="mt-1 text-sm text-error">{{ errors.port }}</span>
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Encryption</span>
        <select
          name="encryption"
          class="select select-bordered w-full"
          :class="{ 'select-error': errors.encryption }"
          :value="connector.encryption"
        >
          <option value="tls">TLS (STARTTLS)</option>
          <option value="ssl">SSL</option>
          <option value="none">None</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Username</span>
        <input
          name="username"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.username }"
          :value="connector.username"
        />
        <span v-if="errors.username" class="mt-1 text-sm text-error">{{ errors.username }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Password</span>
        <input
          name="password"
          type="password"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.password }"
          placeholder="Leave blank to keep the current password"
        />
        <span v-if="errors.password" class="mt-1 text-sm text-error">{{ errors.password }}</span>
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-1">
          <span class="label-text mb-1">From email</span>
          <input
            name="fromEmail"
            type="email"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.fromEmail }"
            :value="connector.fromEmail"
          />
          <span v-if="errors.fromEmail" class="mt-1 text-sm text-error">
            {{ errors.fromEmail }}
          </span>
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">From name</span>
          <input
            name="fromName"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.fromName }"
            :value="connector.fromName"
          />
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Reply-to (optional)</span>
        <input
          name="replyTo"
          type="email"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.replyTo }"
          :value="connector.replyTo"
        />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Daily limit (optional)</span>
        <input
          name="dailyLimit"
          type="number"
          class="input input-bordered w-full"
          :value="connector.dailyLimit"
        />
      </label>

      <button type="submit" class="btn btn-primary" :disabled="processing">Save</button>
    </Form>
  </div>
</template>
