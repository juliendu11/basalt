<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  tags: Array<{
    id: number
    name: string
    color: string
  }>
}>()

const routeParams = { organizationId: props.project.organizationId, projectId: props.project.id }

function confirmDeletion(event: MouseEvent) {
  if (
    !confirm(
      'Delete this tag? Any campaign step or segment condition still referencing it silently stops matching.'
    )
  ) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Tags" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-1 text-2xl font-semibold">Tags</h1>
    <p class="mb-8 text-sm opacity-70">
      Used to segment and target contacts. Tags are also created on the fly from a contact's page.
    </p>

    <Form
      v-slot="{ processing, errors }"
      route="tags.store"
      :params="routeParams"
      class="mb-10 flex items-end gap-2"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          placeholder="e.g. vip"
          class="input input-bordered input-sm"
          :class="{ 'input-error': errors.name }"
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>
      <label class="form-control flex flex-col gap-1">
        <span class="label-text">Color</span>
        <input name="color" type="color" value="#3b82f6" class="h-8 w-16 rounded input-bordered" />
      </label>
      <button type="submit" class="btn btn-primary btn-sm" :disabled="processing">New tag</button>
    </Form>

    <div
      v-if="tags.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No tags in this project yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th></th>
          <th>Name</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="tag in tags" :key="tag.id">
          <td class="w-8">
            <span
              class="inline-block h-4 w-4 rounded-full"
              :style="{ backgroundColor: tag.color }"
            />
          </td>
          <td>
            <Link
              class="link link-hover"
              route="tags.edit"
              :params="{ ...routeParams, tagId: tag.id }"
            >
              {{ tag.name }}
            </Link>
          </td>
          <td class="flex justify-end">
            <Form method="delete" route="tags.destroy" :params="{ ...routeParams, tagId: tag.id }">
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
