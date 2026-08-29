<script setup lang="ts">
import { usePage } from '@inertiajs/vue3'
import { Link, Form } from '@adonisjs/inertia/vue'
import type { Data } from '@generated/data'
import EntityAvatar from '~/components/entity_avatar.vue'

const page = usePage<Data.SharedProps>()
</script>

<template>
  <div v-if="page.props.currentOrganization" class="dropdown">
    <div tabindex="0" role="button" class="btn btn-ghost btn-sm gap-2">
      <EntityAvatar
        v-if="page.props.currentProject"
        :name="page.props.currentProject.name"
        :image-url="page.props.currentProject.imageUrl"
        img-class="h-5 w-5 rounded"
      />
      <span class="truncate">{{ page.props.currentProject?.name ?? 'Select project' }}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-10 w-64 p-2 shadow">
      <li v-if="page.props.projects.length === 0" class="px-3 py-2 text-sm opacity-60">
        No project yet
      </li>
      <div v-for="project in page.props.projects" :key="project.id">
        <Form
          route="projects.switch"
          :params="{ organizationId: page.props.currentOrganization.id, projectId: project.id }"
          class="w-full"
        >
          <button
            type="submit"
            class="flex w-full items-center justify-between rounded-box px-3 py-1.5 hover:bg-base-content/10"
          >
            <span class="flex items-center gap-2">
              <EntityAvatar
                :name="project.name"
                :image-url="project.imageUrl"
                img-class="h-5 w-5 rounded"
              />
              <span class="truncate">{{ project.name }}</span>
            </span>
            <span v-if="page.props.currentProject?.id === project.id">✓</span>
          </button>
        </Form>
      </div>
      <div class="divider my-1"></div>
      <li>
        <Link
          route="projects.create"
          :params="{ organizationId: page.props.currentOrganization.id }"
        >
          + New project
        </Link>
      </li>
    </ul>
  </div>
</template>
