<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
}>()
</script>

<template>
  <Head title="New campaign" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New campaign</h1>

    <Form
      v-slot="{ processing, errors }"
      route="campaigns.store"
      :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      class="flex flex-col gap-4"
    >
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
        <span class="label-text mb-1">Description (optional)</span>
        <textarea
          name="description"
          rows="4"
          class="textarea textarea-bordered w-full"
          :class="{ 'textarea-error': errors.description }"
        />
        <span v-if="errors.description" class="mt-1 text-sm text-error">
          {{ errors.description }}
        </span>
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Re-entry policy</span>
        <select name="reentryPolicy" class="select select-bordered w-full" defaultValue="never">
          <option value="never">
            Never — a contact who has ever gone through this campaign is never re-enrolled
          </option>
          <option value="after_exit">
            After exit — re-enrollable once their previous run has finished
          </option>
          <option value="always">
            Always — re-enrollable any time they re-enter the source segment
          </option>
        </select>
        <span class="mt-1 text-sm text-base-content/60">
          Controls whether a contact can go through this campaign more than once. "Never" is the
          safest default.
        </span>
      </label>

      <label class="label cursor-pointer justify-start gap-3">
        <input type="checkbox" name="enrollExistingMembers" value="true" class="checkbox" />
        <span class="label-text">Enroll contacts already in the source segment</span>
      </label>
      <span class="-mt-3 text-sm text-base-content/60">
        Off by default: only contacts who join the source segment after this campaign is activated
        are enrolled. Turn this on to also enroll contacts who already match it.
      </span>

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">
        Create campaign
      </button>
    </Form>
  </div>
</template>
