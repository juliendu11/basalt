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
    imageUrl: string | null
  }
  emails: Array<{
    id: number
    name: string
    subject: string
    status: 'draft' | 'published'
    updatedAt: string | null
  }>
}>()

const TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
] as const

function confirmDeletion(event: MouseEvent) {
  if (!confirm('Delete this email? This cannot be undone.')) {
    event.preventDefault()
  }
}
</script>

<template>
  <Head title="Emails" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-1 flex items-center justify-between">
      <ProjectHeading :project="project" />
      <Link
        class="btn btn-primary btn-sm"
        route="emails.create"
        :params="{ organizationId: project.organizationId, projectId: project.id }"
      >
        New email
      </Link>
    </div>

    <div
      v-if="emails.length === 0"
      class="rounded-box border border-base-200 p-8 text-center opacity-70"
    >
      No emails yet.
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Subject</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="email in emails" :key="email.id">
          <td>
            <Link
              class="link link-hover"
              route="emails.edit"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                emailId: email.id,
              }"
            >
              {{ email.name }}
            </Link>
          </td>
          <td>{{ email.subject }}</td>
          <td>
            <span
              class="badge badge-sm"
              :class="email.status === 'published' ? 'badge-success' : 'badge-ghost'"
            >
              {{ email.status }}
            </span>
          </td>
          <td class="flex flex-wrap gap-2">
            <Form
              method="post"
              route="emails.duplicate"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                emailId: email.id,
              }"
            >
              <button type="submit" class="btn btn-xs">Duplicate</button>
            </Form>
            <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="btn btn-xs">Send test…</div>
              <div
                tabindex="0"
                class="dropdown-content menu bg-base-100 rounded-box z-10 w-64 p-3 shadow"
              >
                <Form
                  v-slot="{ processing, errors }"
                  method="post"
                  route="emails.sendTest"
                  :params="{
                    organizationId: project.organizationId,
                    projectId: project.id,
                    emailId: email.id,
                  }"
                  class="flex flex-col gap-2"
                >
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs">Send to</span>
                    <input
                      name="testEmail"
                      type="email"
                      placeholder="you@example.com"
                      class="input input-bordered input-xs"
                      :class="{ 'input-error': errors.testEmail }"
                      required
                    />
                    <span v-if="errors.testEmail" class="mt-1 text-xs text-error">
                      {{ errors.testEmail }}
                    </span>
                  </label>
                  <button type="submit" class="btn btn-primary btn-xs" :disabled="processing">
                    Send test
                  </button>
                </Form>
              </div>
            </div>
            <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="btn btn-xs">Clone in language…</div>
              <div
                tabindex="0"
                class="dropdown-content menu bg-base-100 rounded-box z-10 w-56 p-3 shadow"
              >
                <Form
                  v-slot="{ processing }"
                  method="post"
                  route="emails.translate"
                  :params="{
                    organizationId: project.organizationId,
                    projectId: project.id,
                    emailId: email.id,
                  }"
                  class="flex flex-col gap-2"
                >
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs">Target language</span>
                    <select
                      name="targetLanguage"
                      class="select select-bordered select-xs"
                      defaultValue="en"
                    >
                      <option
                        v-for="language in TRANSLATE_LANGUAGES"
                        :key="language.code"
                        :value="language.code"
                      >
                        {{ language.label }}
                      </option>
                    </select>
                  </label>
                  <button type="submit" class="btn btn-primary btn-xs" :disabled="processing">
                    Clone &amp; translate
                  </button>
                </Form>
              </div>
            </div>
            <Form
              method="delete"
              route="emails.destroy"
              :params="{
                organizationId: project.organizationId,
                projectId: project.id,
                emailId: email.id,
              }"
            >
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
