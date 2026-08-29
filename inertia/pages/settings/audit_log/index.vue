<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  logs: {
    data: Array<{
      id: number
      action: string
      entityType: string | null
      entityId: number | null
      actorName: string
      metadata: any
      occurredAt: string | null
    }>
    metadata: {
      total: string
      perPage: string
      currentPage: string
      lastPage: string
    }
  }
  filters: {
    actorUserId: number | null
    action: string | null
    from: string | null
    to: string | null
  }
}>()
</script>

<template>
  <Head title="Audit log" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <h2 class="mb-4 text-lg font-medium">Audit log</h2>

    <Form
      route="audit_log.index"
      :params="{ organizationId: project.organizationId, projectId: project.id }"
      class="mb-6 flex flex-wrap items-end gap-3"
    >
      <label class="form-control">
        <span class="label-text mb-1">Action</span>
        <input
          name="action"
          type="text"
          placeholder="e.g. campaign.activated"
          class="input input-bordered input-sm"
          :value="filters.action"
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">From</span>
        <input
          name="from"
          type="date"
          class="input input-bordered input-sm"
          :value="filters.from"
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">To</span>
        <input name="to" type="date" class="input input-bordered input-sm" :value="filters.to" />
      </label>
      <button type="submit" class="btn btn-sm">Filter</button>
    </Form>

    <div
      v-if="logs.data.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No audit log entries yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Entity</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs.data" :key="log.id">
          <td>{{ log.occurredAt }}</td>
          <td>{{ log.actorName }}</td>
          <td>
            <code class="text-xs">{{ log.action }}</code>
          </td>
          <td>
            {{ log.entityType }}<span v-if="log.entityId"> #{{ log.entityId }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="Number(logs.metadata.lastPage) > 1" class="join mt-6">
      <Link
        v-for="page in Number(logs.metadata.lastPage)"
        :key="page"
        class="join-item btn btn-sm"
        :class="{ 'btn-active': page === Number(logs.metadata.currentPage) }"
        route="audit_log.index"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
        :qs="{ page, action: filters.action, from: filters.from, to: filters.to }"
      >
        {{ page }}
      </Link>
    </div>
  </div>
</template>
