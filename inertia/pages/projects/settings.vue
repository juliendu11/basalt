<script setup lang="ts">
import { Head } from '@inertiajs/vue3'
import { Form, Link } from '@adonisjs/inertia/vue'
import ProjectHeading from '~/components/project_heading.vue'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    timezone: string
    imageUrl: string | null
    defaultSenderName: string | null
    defaultSenderEmail: string | null
  }
}>()

const timezones = Intl.supportedValuesOf('timeZone')

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this project and all of its data? This cannot be undone.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Project settings" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <ProjectHeading :project="project" />

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">General</h2>
      <Form
        v-slot="{ processing, errors }"
        method="patch"
        route="projects.update"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
        class="flex max-w-sm flex-col gap-4"
      >
        <label class="form-control">
          <span class="label-text mb-1">Name</span>
          <input
            name="name"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.name }"
            :value="project.name"
          />
          <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Timezone</span>
          <select
            name="timezone"
            class="select select-bordered w-full"
            :class="{ 'select-error': errors.timezone }"
            :value="project.timezone"
          >
            <option v-for="timezone in timezones" :key="timezone" :value="timezone">
              {{ timezone }}
            </option>
          </select>
          <span v-if="errors.timezone" class="mt-1 text-sm text-error">
            {{ errors.timezone }}
          </span>
        </label>
        <p class="text-xs opacity-60">
          Changing the timezone only affects future scheduling calculations, never campaigns already
          scheduled.
        </p>

        <div class="form-control">
          <span class="label-text mb-1">Image</span>
          <img
            v-if="project.imageUrl"
            :src="project.imageUrl"
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
          <label v-if="project.imageUrl" class="label cursor-pointer justify-start gap-2 px-0">
            <input type="checkbox" name="removeImage" value="true" class="checkbox checkbox-sm" />
            <span class="label-text">Remove current image</span>
          </label>
        </div>

        <label class="form-control">
          <span class="label-text mb-1">Default sender name (optional)</span>
          <input
            name="defaultSenderName"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.defaultSenderName }"
            :value="project.defaultSenderName"
          />
          <span v-if="errors.defaultSenderName" class="mt-1 text-sm text-error">
            {{ errors.defaultSenderName }}
          </span>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Default sender email (optional)</span>
          <input
            name="defaultSenderEmail"
            type="email"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.defaultSenderEmail }"
            :value="project.defaultSenderEmail"
          />
          <span v-if="errors.defaultSenderEmail" class="mt-1 text-sm text-error">
            {{ errors.defaultSenderEmail }}
          </span>
        </label>
        <p class="text-xs opacity-60">
          Used to pre-fill the sender name and email when creating a new email in this project.
        </p>

        <button type="submit" class="btn btn-primary btn-sm self-start" :disabled="processing">
          Save
        </button>
      </Form>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">SMTP connectors</h2>
      <p class="mb-3 text-sm opacity-70">
        Manage the SMTP servers used to send campaigns from this project.
      </p>
      <Link
        class="btn btn-sm"
        route="smtp_connectors.index"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      >
        Manage SMTP connectors
      </Link>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">Custom fields</h2>
      <p class="mb-3 text-sm opacity-70">
        Define typed fields (text, number, boolean, date) that can be filled in on contacts and used
        to filter segments.
      </p>
      <Link
        class="btn btn-sm"
        route="custom_field_definitions.index"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      >
        Manage custom fields
      </Link>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">API keys</h2>
      <p class="mb-3 text-sm opacity-70">
        Manage the keys external services use to create, read, update and delete contacts and tags
        via the API.
      </p>
      <Link
        class="btn btn-sm"
        route="api_keys.index"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      >
        Manage API keys
      </Link>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-medium">Observability</h2>
      <p class="mb-3 text-sm opacity-70">
        Review who did what, and retry jobs that failed permanently.
      </p>
      <div class="flex gap-2">
        <Link
          class="btn btn-sm"
          route="audit_log.index"
          :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
        >
          Audit log
        </Link>
        <Link
          class="btn btn-sm"
          route="failed_jobs.index"
          :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
        >
          Failed jobs
        </Link>
      </div>
    </section>

    <section class="rounded-box border border-error/30 p-4">
      <h2 class="mb-1 text-lg font-medium text-error">Danger zone</h2>
      <p class="mb-3 text-sm opacity-70">
        Deleting a project permanently removes all of its contacts, campaigns and data. This cannot
        be undone.
      </p>
      <Form
        method="delete"
        route="projects.destroy"
        :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      >
        <button type="submit" class="btn btn-error btn-sm" @click="confirmDeletion">
          Delete project
        </button>
      </Form>
    </section>
  </div>
</template>
