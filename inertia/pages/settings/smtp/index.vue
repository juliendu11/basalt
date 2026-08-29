<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import { csrfHeaders } from '~/utils/csrf'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  connectors: Array<{
    id: number
    name: string
    host: string
    port: number
    encryption: 'none' | 'ssl' | 'tls'
    isDefault: boolean
    enabled: boolean
    lastTestedAt: string | null
    lastTestStatus: 'unknown' | 'success' | 'failed'
  }>
}>()

const testResults = ref<Record<number, { success: boolean; message?: string } | 'pending'>>({})

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this SMTP connector? This cannot be undone.')) {
    event.preventDefault()
  }
}

async function testConnector(connectorId: number) {
  testResults.value[connectorId] = 'pending'

  const response = await fetch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/settings/smtp/${connectorId}/test`,
    { method: 'POST', headers: csrfHeaders() }
  )
  testResults.value[connectorId] = await response.json()
}
</script>

<template>
  <Head title="SMTP connectors" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="smtp_connectors.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New connector
      </Link>
    </div>

    <div
      v-if="connectors.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No SMTP connectors yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Host</th>
          <th>Status</th>
          <th>Last test</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="connector in connectors" :key="connector.id">
          <td>
            <Link
              class="link link-hover"
              route="smtp_connectors.edit"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                connectorId: connector.id,
              }"
            >
              {{ connector.name }}
            </Link>
            <span v-if="connector.isDefault" class="badge badge-sm badge-primary ml-2">
              default
            </span>
          </td>
          <td>{{ connector.host }}:{{ connector.port }} ({{ connector.encryption }})</td>
          <td>
            <span
              class="badge badge-sm"
              :class="connector.enabled ? 'badge-success' : 'badge-ghost'"
            >
              {{ connector.enabled ? 'enabled' : 'disabled' }}
            </span>
          </td>
          <td>
            <template v-if="testResults[connector.id] === 'pending'">Testing…</template>
            <template v-else-if="testResults[connector.id]">
              <span
                class="badge badge-sm"
                :class="
                  (testResults[connector.id] as { success: boolean }).success
                    ? 'badge-success'
                    : 'badge-error'
                "
              >
                {{
                  (testResults[connector.id] as { success: boolean }).success ? 'success' : 'failed'
                }}
              </span>
              <span
                v-if="
                  !(testResults[connector.id] as { success: boolean; message?: string }).success
                "
                class="ml-1 text-xs opacity-70"
              >
                {{ (testResults[connector.id] as { message?: string }).message }}
              </span>
            </template>
            <template v-else>
              <span class="badge badge-sm badge-ghost">{{ connector.lastTestStatus }}</span>
            </template>
          </td>
          <td class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-xs" @click="testConnector(connector.id)">
              Test
            </button>
            <Form
              method="post"
              route="smtp_connectors.setDefault"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                connectorId: connector.id,
              }"
            >
              <button type="submit" class="btn btn-xs" :disabled="connector.isDefault">
                Set default
              </button>
            </Form>
            <Form
              method="post"
              route="smtp_connectors.toggleEnabled"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                connectorId: connector.id,
              }"
            >
              <button type="submit" class="btn btn-xs">
                {{ connector.enabled ? 'Disable' : 'Enable' }}
              </button>
            </Form>
            <Form
              method="delete"
              route="smtp_connectors.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                connectorId: connector.id,
              }"
            >
              <button type="submit" class="btn btn-xs btn-error" @click="confirmDeletion">
                Delete
              </button>
            </Form>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
