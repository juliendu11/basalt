<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  contact: { id: number; email: string }
  history: {
    data: Array<{
      kind: 'enrollment' | 'execution_event' | 'email_event' | 'unsubscribe_event'
      occurredAt: string | null
      summary: string
      metadata: any
    }>
    page: number
    hasMore: boolean
  }
}>()

const kindLabel: Record<string, string> = {
  enrollment: 'Enrollment',
  execution_event: 'Campaign step',
  email_event: 'Email',
  unsubscribe_event: 'Unsubscribe',
}
</script>

<template>
  <Head :title="`History — ${contact.email}`" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">{{ contact.email }}</h1>
      <Link
        class="btn btn-sm"
        route="contacts.show"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
      >
        Back to contact
      </Link>
    </div>
    <p class="mb-6 text-sm opacity-70">History across enrollments, campaign steps, and emails.</p>

    <div
      v-if="history.data.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No history yet.
    </div>

    <ul v-else class="timeline timeline-vertical timeline-compact">
      <li v-for="(entry, index) in history.data" :key="index">
        <hr v-if="index > 0" />
        <div class="timeline-start text-xs opacity-60">{{ entry.occurredAt }}</div>
        <div class="timeline-middle">•</div>
        <div class="timeline-end rounded-box border border-base-200 p-3">
          <span class="badge badge-sm mb-1">{{ kindLabel[entry.kind] }}</span>
          <p class="text-sm">{{ entry.summary }}</p>
        </div>
        <hr />
      </li>
    </ul>

    <div v-if="history.hasMore" class="mt-6">
      <Link
        class="btn btn-sm"
        route="contacts.history"
        :params="{
          organizationId: project.organizationId,
          projectId: project.id,
          contactId: contact.id,
        }"
        :qs="{ page: history.page + 1 }"
      >
        Load more
      </Link>
    </div>
  </div>
</template>
