<script setup lang="ts">
import { Head, usePage } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import type { Data } from '@generated/data'

const props = defineProps<{
  organization: {
    id: number
    name: string
    slug: string
    ownerUserId: number
    imageUrl: string | null
  }
}>()

const page = usePage<Data.SharedProps>()
const isOwner = () => page.props.user?.id === props.organization.ownerUserId

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this organization and everything in it? This cannot be undone.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Organization settings" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-8 text-2xl font-semibold">{{ organization.name }}</h1>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">General</h2>
      <Form
        v-slot="{ processing, errors }"
        method="patch"
        route="organizations.update"
        :params="{ organizationId: organization.id }"
        class="flex max-w-sm flex-col gap-4"
      >
        <label class="form-control">
          <span class="label-text mb-1">Name</span>
          <input
            name="name"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.name }"
            :value="organization.name"
          />
          <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
        </label>

        <div class="form-control">
          <span class="label-text mb-1">Image</span>
          <img
            v-if="organization.imageUrl"
            :src="organization.imageUrl"
            alt=""
            class="mb-2 h-16 w-16 rounded-box object-cover"
          />
          <input
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="file-input file-input-bordered w-full"
            :class="{ 'file-input-error': errors.image }"
          />
          <span v-if="errors.image" class="mt-1 text-sm text-error">{{ errors.image }}</span>
          <label v-if="organization.imageUrl" class="label cursor-pointer justify-start gap-2 px-0">
            <input type="checkbox" name="removeImage" value="true" class="checkbox checkbox-sm" />
            <span class="label-text">Remove current image</span>
          </label>
        </div>

        <button type="submit" class="btn btn-primary btn-sm self-start" :disabled="processing">
          Save
        </button>
      </Form>
    </section>

    <section v-if="isOwner()" class="rounded-box border border-error/30 p-4">
      <h2 class="mb-1 text-lg font-medium text-error">Danger zone</h2>
      <p class="mb-3 text-sm opacity-70">
        Deleting an organization permanently removes all of its projects and data. This cannot be
        undone.
      </p>
      <Form
        method="delete"
        route="organizations.destroy"
        :params="{ organizationId: organization.id }"
      >
        <button type="submit" class="btn btn-error btn-sm" @click="confirmDeletion">
          Delete organization
        </button>
      </Form>
    </section>
  </div>
</template>
