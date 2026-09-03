<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import VersionHistory from '~/components/campaign_builder/version_history.vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    imageUrl: string | null
  }
  campaign: {
    id: number
    name: string
    description: string | null
    status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
    draftVersionId: number | null
    publishedVersionId: number | null
    createdAt: string | null
  }
  versions: Array<{
    id: number
    versionNumber: number
    status: 'draft' | 'published' | 'archived'
    publishedAt: string | null
    createdAt: string | null
  }>
}>()

const statusBadge: Record<string, string> = {
  draft: 'badge-ghost',
  active: 'badge-success',
  paused: 'badge-warning',
  completed: 'badge-info',
  archived: 'badge-neutral',
}

const routeParams = {
  organizationId: props.project.organizationId,
  projectId: props.project.id,
  campaignId: props.campaign.id,
}

const editingName = ref(false)
</script>

<template>
  <Head :title="campaign.name" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-sm"
        route="campaigns.index"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        Back to campaigns
      </Link>
    </div>

    <div class="rounded-box border border-base-200 p-6">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <Form
            v-if="editingName"
            method="patch"
            route="campaigns.update"
            :params="routeParams"
            class="flex items-center gap-2"
            :on-success="() => (editingName = false)"
          >
            <input
              name="name"
              type="text"
              class="input input-bordered input-sm"
              :value="campaign.name"
              autofocus
            />
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" class="btn btn-ghost btn-sm" @click="editingName = false">
              Cancel
            </button>
          </Form>
          <div v-else class="flex items-center gap-2">
            <h2 class="text-xl font-semibold">{{ campaign.name }}</h2>
            <button type="button" class="btn btn-ghost btn-xs" @click="editingName = true">
              Rename
            </button>
          </div>
          <p v-if="campaign.description" class="mt-1 text-sm opacity-70">
            {{ campaign.description }}
          </p>
        </div>
        <span class="badge" :class="statusBadge[campaign.status]">{{ campaign.status }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <Form
          v-if="campaign.status === 'draft'"
          method="post"
          route="campaigns.activate"
          :params="routeParams"
        >
          <button type="submit" class="btn btn-primary btn-sm">Activate</button>
        </Form>
        <Form
          v-if="campaign.status === 'active'"
          method="post"
          route="campaigns.pause"
          :params="routeParams"
        >
          <button type="submit" class="btn btn-sm">Pause</button>
        </Form>
        <Form
          v-if="campaign.status === 'paused'"
          method="post"
          route="campaigns.resume"
          :params="routeParams"
        >
          <button type="submit" class="btn btn-sm">Resume</button>
        </Form>
        <Form
          v-if="['active', 'paused', 'completed', 'draft'].includes(campaign.status)"
          method="post"
          route="campaigns.archive"
          :params="routeParams"
        >
          <button type="submit" class="btn btn-sm btn-ghost">Archive</button>
        </Form>
        <Form method="post" route="campaigns.duplicate" :params="routeParams">
          <button type="submit" class="btn btn-sm btn-ghost">Duplicate</button>
        </Form>
        <Link
          class="btn btn-sm btn-outline btn-primary"
          route="campaigns.builder.show"
          :params="routeParams"
        >
          Open builder
        </Link>
        <Link class="btn btn-sm btn-outline" route="statistics.campaign" :params="routeParams">
          Statistics
        </Link>
        <Link class="btn btn-sm btn-outline" route="campaigns.upcoming" :params="routeParams">
          Email activity
        </Link>
      </div>
    </div>

    <VersionHistory
      :organization-id="project.organizationId"
      :project-id="project.id"
      :campaign-id="campaign.id"
      :versions="versions"
    />
  </div>
</template>
