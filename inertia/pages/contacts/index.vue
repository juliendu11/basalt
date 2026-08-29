<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ContactStatusBadge from '~/components/contact_status_badge.vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  contacts: {
    data: Array<{
      id: number
      email: string
      firstName: string | null
      lastName: string | null
      status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'
      createdAt: string | null
    }>
    metadata: {
      total: string
      perPage: string
      currentPage: string
      lastPage: string
    }
  }
  tags: Array<{ id: number; name: string; color: string }>
  filters: { search?: string; status?: string; tagId?: number }
}>()

const statuses = ['subscribed', 'unsubscribed', 'bounced', 'complained', 'blocked'] as const
</script>

<template>
  <Head title="Contacts" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="contacts.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New contact
      </Link>
    </div>
    <Form
      route="contacts.index"
      :params="{ organizationId: project.organizationId, projectId: project.id }"
      class="mb-6 flex flex-wrap items-end gap-3"
    >
      <label class="form-control">
        <span class="label-text mb-1">Search</span>
        <input
          name="search"
          type="text"
          placeholder="Email or name"
          class="input input-bordered input-sm"
          :value="filters.search"
        />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Status</span>
        <select name="status" class="select select-bordered select-sm" :value="filters.status">
          <option value="">All</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Tag</span>
        <select name="tagId" class="select select-bordered select-sm" :value="filters.tagId">
          <option value="">All</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
        </select>
      </label>

      <button type="submit" class="btn btn-sm">Filter</button>
    </Form>

    <div
      v-if="contacts.data.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No contacts yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="contact in contacts.data" :key="contact.id">
          <td>
            <Link
              class="link link-hover"
              route="contacts.show"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                contactId: contact.id,
              }"
            >
              {{ contact.email }}
            </Link>
          </td>
          <td>{{ [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—' }}</td>
          <td><ContactStatusBadge :status="contact.status" /></td>
        </tr>
      </tbody>
    </table>

    <div v-if="Number(contacts.metadata.lastPage) > 1" class="join mt-6">
      <Link
        v-for="page in Number(contacts.metadata.lastPage)"
        :key="page"
        class="join-item btn btn-sm"
        :class="{ 'btn-active': page === Number(contacts.metadata.currentPage) }"
        route="contacts.index"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
        :qs="{ page, search: filters.search, status: filters.status, tagId: filters.tagId }"
      >
        {{ page }}
      </Link>
    </div>
  </div>
</template>
