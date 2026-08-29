<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Link } from '@adonisjs/inertia/vue'
import EntityAvatar from '~/components/entity_avatar.vue'

defineProps<{
  organizations: Array<{ id: number; name: string; slug: string; imageUrl: string | null }>
}>()
</script>

<template>
  <Head title="Organizations" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">Organizations</h1>
      <Link route="organizations.create" class="btn btn-primary btn-sm">New organization</Link>
    </div>

    <div
      v-if="organizations.length === 0"
      class="rounded-box border border-base-200 p-8 text-center"
    >
      <p class="mb-4 opacity-70">You don't belong to any organization yet.</p>
      <Link route="organizations.create" class="btn btn-primary btn-sm">
        Create your first organization
      </Link>
    </div>

    <ul v-else class="menu bg-base-100 rounded-box border border-base-200 p-2">
      <li v-for="organization in organizations" :key="organization.id">
        <Link route="organization_members.index" :params="{ organizationId: organization.id }">
          <EntityAvatar
            :name="organization.name"
            :image-url="organization.imageUrl"
            img-class="h-6 w-6 rounded-box"
          />
          {{ organization.name }}
        </Link>
      </li>
    </ul>
  </div>
</template>
