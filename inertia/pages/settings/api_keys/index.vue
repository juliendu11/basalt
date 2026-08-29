<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  apiKeys: Array<{
    id: number
    name: string
    tokenPrefix: string
    lastUsedAt: string | null
    revokedAt: string | null
    createdAt: string | null
  }>
  newToken?: string
}>()

function confirmRevoke(event: MouseEvent) {
  if (!confirm('Revoke this API key? Any service using it will immediately lose access.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="API keys" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-1 text-2xl font-semibold">API keys</h1>
    <p class="mb-8 text-sm opacity-70">
      Used by external services to create, read, update and delete contacts and tags via the
      <code>/api/v1</code> API, authenticated with <code>Authorization: Bearer &lt;token&gt;</code>.
    </p>

    <div v-if="props.newToken" class="alert alert-success mb-8 flex-col items-start gap-2">
      <span class="font-medium">Copy this key now — it will not be shown again.</span>
      <code class="w-full break-all rounded bg-base-100 p-2 text-sm">{{ props.newToken }}</code>
    </div>

    <Form
      v-slot="{ processing, errors }"
      route="api_keys.store"
      :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      class="mb-10 flex items-end gap-2"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          placeholder="e.g. CRM sync"
          class="input input-bordered input-sm"
          :class="{ 'input-error': errors.name }"
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>
      <button type="submit" class="btn btn-primary btn-sm" :disabled="processing">
        Create API key
      </button>
    </Form>

    <div
      v-if="apiKeys.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No API keys yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Token</th>
          <th>Last used</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="apiKey in apiKeys" :key="apiKey.id">
          <td>{{ apiKey.name }}</td>
          <td class="font-mono text-sm opacity-70">{{ apiKey.tokenPrefix }}…</td>
          <td class="text-sm opacity-70">{{ apiKey.lastUsedAt ?? 'never' }}</td>
          <td>
            <span
              class="badge badge-sm"
              :class="apiKey.revokedAt ? 'badge-ghost' : 'badge-success'"
            >
              {{ apiKey.revokedAt ? 'revoked' : 'active' }}
            </span>
          </td>
          <td class="flex justify-end gap-2">
            <Form
              v-if="!apiKey.revokedAt"
              method="delete"
              route="api_keys.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                apiKeyId: apiKey.id,
              }"
            >
              <button type="submit" class="btn btn-xs btn-error" @click="confirmRevoke">
                Revoke
              </button>
            </Form>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
