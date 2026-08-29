<script setup lang="ts">
import { computed } from 'vue'
import { Form, Link } from '@adonisjs/inertia/vue'

const props = defineProps<{
  organizationId: number
  projectId: number
  campaignId: number
  versions: { id: number; versionNumber: number; status: string; publishedAt: string | null }[]
}>()

// A draft can only be deleted when there's a published version to fall back
// to (mirrors `CampaignBuilderService.deleteDraft`'s guard) — a campaign
// must always have at least one version.
const hasPublishedVersion = computed(() => props.versions.some((v) => v.status !== 'draft'))

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this draft? Unpublished changes will be lost.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <div class="mt-8">
    <h3 class="mb-3 text-lg font-semibold">Version history</h3>
    <table class="table">
      <thead>
        <tr>
          <th>Version</th>
          <th>Status</th>
          <th>Published</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="version in versions" :key="version.id">
          <td>#{{ version.versionNumber }}</td>
          <td>{{ version.status }}</td>
          <td>{{ version.publishedAt ? new Date(version.publishedAt).toLocaleString() : '—' }}</td>
          <td>
            <Link
              v-if="version.status !== 'draft'"
              class="link link-sm"
              route="campaigns.builder.show"
              :params="{ organizationId, projectId, campaignId }"
              :qs="{ versionId: version.id }"
            >
              View
            </Link>
            <div v-else class="flex gap-2">
              <Form
                method="post"
                route="campaigns.activate"
                :params="{ organizationId, projectId, campaignId }"
              >
                <button type="submit" class="btn btn-primary btn-xs">Publish</button>
              </Form>
              <Form
                v-if="hasPublishedVersion"
                method="delete"
                route="campaigns.versions.destroy"
                :params="{ organizationId, projectId, campaignId, versionId: version.id }"
              >
                <button type="submit" class="btn btn-ghost btn-xs" @click="confirmDeletion">
                  Delete
                </button>
              </Form>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
