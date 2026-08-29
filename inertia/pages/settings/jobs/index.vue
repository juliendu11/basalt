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
  queues: string[]
  selectedQueue: string | null
  jobs: Array<{
    id: string
    queue: string
    name: string
    failedReason: string
    attemptsMade: number
    data: any
    timestamp: number
  }>
  error: string | null
}>()
</script>

<template>
  <Head title="Failed jobs" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <h2 class="mb-4 text-lg font-medium">Failed jobs</h2>

    <div class="mb-6 flex flex-wrap gap-2">
      <Link
        class="btn btn-sm"
        :class="{ 'btn-active': !selectedQueue }"
        route="failed_jobs.index"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        All queues
      </Link>
      <Link
        v-for="queue in queues"
        :key="queue"
        class="btn btn-sm"
        :class="{ 'btn-active': selectedQueue === queue }"
        route="failed_jobs.index"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
        :qs="{ queue }"
      >
        {{ queue }}
      </Link>
    </div>

    <div v-if="error" class="alert alert-error mb-6">{{ error }}</div>

    <div
      v-else-if="jobs.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No failed jobs.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Queue</th>
          <th>Job</th>
          <th>Attempts</th>
          <th>Reason</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="job in jobs" :key="`${job.queue}-${job.id}`">
          <td>{{ job.queue }}</td>
          <td>{{ job.name }}</td>
          <td>{{ job.attemptsMade }}</td>
          <td class="max-w-xs truncate" :title="job.failedReason">{{ job.failedReason }}</td>
          <td>
            <Form
              method="post"
              route="failed_jobs.retry"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                queue: job.queue,
                jobId: job.id,
              }"
            >
              <button type="submit" class="btn btn-xs">Retry</button>
            </Form>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
