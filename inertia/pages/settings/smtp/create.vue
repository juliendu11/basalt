<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import { csrfHeaders } from '~/utils/csrf'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
}>()

const testResult = ref<{ success: boolean; message?: string } | 'pending' | null>(null)

async function testConnection(event: MouseEvent) {
  const form = (event.currentTarget as HTMLElement).closest('form')
  if (!form) return
  testResult.value = 'pending'

  const data = new FormData(form)
  const response = await fetch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/settings/smtp/test`,
    {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        host: data.get('host'),
        port: Number(data.get('port')),
        username: data.get('username'),
        password: data.get('password'),
        encryption: data.get('encryption'),
      }),
    }
  )
  testResult.value = await response.json()
}
</script>

<template>
  <Head title="New SMTP connector" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New SMTP connector</h1>

    <Form
      v-slot="{ processing, errors }"
      route="smtp_connectors.store"
      :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
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

      <div class="flex gap-3">
        <label class="form-control flex-[3]">
          <span class="label-text mb-1">Host</span>
          <input
            name="host"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.host }"
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
        />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Daily limit (optional)</span>
        <input name="dailyLimit" type="number" class="input input-bordered w-full" />
      </label>

      <div class="flex items-center gap-3">
        <button type="button" class="btn btn-sm" @click="testConnection">Test connection</button>
        <template v-if="testResult === 'pending'">
          <span class="text-sm opacity-70">Testing…</span>
        </template>
        <template v-else-if="testResult">
          <span
            class="badge badge-sm"
            :class="testResult.success ? 'badge-success' : 'badge-error'"
          >
            {{ testResult.success ? 'success' : 'failed' }}
          </span>
          <span v-if="!testResult.success" class="text-xs opacity-70">{{
            testResult.message
          }}</span>
        </template>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="processing">Create connector</button>
    </Form>
  </div>
</template>
