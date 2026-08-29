<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
</script>

<template>
  <Head title="New organization" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-8 text-2xl font-semibold">Create an organization</h1>
    <p class="mb-6 text-sm opacity-70">
      An organization groups the projects your team works on together.
    </p>

    <Form v-slot="{ processing, errors }" route="organizations.store" class="flex flex-col gap-4">
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          name="name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
          autofocus
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Image (optional)</span>
        <input
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="file-input file-input-bordered w-full"
          :class="{ 'file-input-error': errors.image }"
        />
        <span v-if="errors.image" class="mt-1 text-sm text-error">{{ errors.image }}</span>
      </label>

      <button type="submit" class="btn btn-primary" :disabled="processing">
        Create organization
      </button>
    </Form>
  </div>
</template>
