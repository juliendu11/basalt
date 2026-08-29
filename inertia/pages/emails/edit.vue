<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import VariablePicker from '~/components/variable_picker.vue'
import { csrfHeaders } from '~/utils/csrf'
import { htmlToText } from '~/utils/html_to_text'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  email: {
    id: number
    emailLayoutId: number | null
    name: string
    subject: string
    preheader: string | null
    senderName: string
    senderEmail: string
    replyTo: string | null
    htmlContent: string | null
    bodyContent: string | null
    textContent: string | null
    status: 'draft' | 'published'
  }
  layouts: Array<{ id: number; name: string; htmlContent: string }>
}>()

const EMAIL_BODY_TOKEN = /\{\{\s*email_body\s*\}\}/g

const name = ref(props.email.name)
const senderName = ref(props.email.senderName)
const senderEmail = ref(props.email.senderEmail)
const replyTo = ref(props.email.replyTo ?? '')
const preheader = ref(props.email.preheader ?? '')
const subject = ref(props.email.subject)
// `''` (not `null`) for "no layout" — a native `<select>` option's bound
// value always stringifies for the real form submission, and `''` is what
// makes `request.input('layoutId')` correctly read as absent server-side
// (`EmailsController#update` branches on that, same convention as create).
const selectedLayoutId = ref<number | ''>(props.email.emailLayoutId ?? '')
const htmlContentEl = ref<HTMLTextAreaElement | null>(null)
const htmlContent = ref(props.email.htmlContent ?? '')
const bodyContentEl = ref<HTMLTextAreaElement | null>(null)
const bodyContent = ref(props.email.bodyContent ?? '')
const textContentEl = ref<HTMLTextAreaElement | null>(null)
const textContent = ref(props.email.textContent ?? '')
const previewHtml = ref<string | null>(null)
const previewText = ref<string | null>(null)
const previewTab = ref<'html' | 'text'>('html')
const previewOpen = ref(false)

const selectedLayout = computed(() => props.layouts.find((l) => l.id === selectedLayoutId.value))

/**
 * Non-destructive content handoff when the layout selection changes —
 * never overwrites content the user already has in the field they're
 * switching TO:
 * - no layout → a layout: seeds `bodyContent` from the current
 *   `htmlContent` fragment, mirroring how "create from layout" expects a
 *   fresh body.
 * - a layout → no layout: seeds `htmlContent` with the OLD layout's frame
 *   composed with the current `bodyContent`, so the branding frame isn't
 *   silently lost — mirrors `EmailLayoutService#delete`'s materialization.
 * - a layout → a different layout: `bodyContent` carries over as-is, since
 *   every layout shares the same `{{ email_body }}` contract.
 */
watch(selectedLayoutId, (newId, oldId) => {
  if (newId && !oldId && !bodyContent.value) {
    bodyContent.value = htmlContent.value
  } else if (!newId && oldId && !htmlContent.value) {
    const oldLayout = props.layouts.find((l) => l.id === oldId)
    if (oldLayout) {
      htmlContent.value = oldLayout.htmlContent.replace(EMAIL_BODY_TOKEN, () => bodyContent.value)
    }
  }
})

/**
 * Converts only whichever field is currently visible (`bodyContent` when
 * layout-linked, mirroring `bodyContent`/`htmlContent`'s split —
 * `textContent` here holds just the fragment too). The layout's own text
 * frame is applied on top of it separately at preview/send time
 * (`composeEmailText`, `email_layout_composer.ts`), never edited from this
 * page.
 */
function generateTextFromHtml() {
  textContent.value = htmlToText(selectedLayoutId.value ? bodyContent.value : htmlContent.value)
}

async function openPreview(tab: 'html' | 'text' = 'html') {
  const response = await fetch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/emails/${props.email.id}/preview`,
    { method: 'POST', headers: csrfHeaders() }
  )
  const body = await response.json()
  previewHtml.value = body.html
  previewText.value = body.text
  previewTab.value = tab
  previewOpen.value = true
}
</script>

<template>
  <Head title="Edit email" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="mb-8 text-2xl font-semibold">Edit email</h1>
        <span
          class="badge badge-sm"
          :class="email.status === 'published' ? 'badge-success' : 'badge-ghost'"
        >
          {{ email.status }}
        </span>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-sm" @click="openPreview('html')">Preview</button>
        <Form
          method="post"
          route="emails.publish"
          :params="{
            organizationId: props.project.organizationId,
            projectId: props.project.id,
            emailId: props.email.id,
          }"
        >
          <button type="submit" class="btn btn-sm">
            {{ email.status === 'published' ? 'Unpublish' : 'Publish' }}
          </button>
        </Form>
      </div>
    </div>

    <p class="mb-4 text-xs opacity-60">
      Editing this email never affects campaigns that already froze its content at publication —
      only future drafts see these changes.
    </p>
    <p v-if="selectedLayout" class="mb-4 text-xs opacity-60">
      Using the <span class="font-medium">{{ selectedLayout.name }}</span> layout — its branding
      frame is shared live with every other email using it.
    </p>

    <Form
      v-slot="{ processing, errors }"
      method="patch"
      route="emails.update"
      :params="{
        organizationId: props.project.organizationId,
        projectId: props.project.id,
        emailId: props.email.id,
      }"
      class="flex flex-col gap-4"
    >
      <label class="form-control">
        <span class="label-text mb-1">Name</span>
        <input
          v-model="name"
          name="name"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.name }"
        />
        <span v-if="errors.name" class="mt-1 text-sm text-error">{{ errors.name }}</span>
      </label>

      <div class="flex gap-3">
        <label class="form-control flex-1">
          <span class="label-text mb-1">Sender name</span>
          <input
            v-model="senderName"
            name="senderName"
            type="text"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.senderName }"
          />
        </label>
        <label class="form-control flex-1">
          <span class="label-text mb-1">Sender email</span>
          <input
            v-model="senderEmail"
            name="senderEmail"
            type="email"
            class="input input-bordered w-full"
            :class="{ 'input-error': errors.senderEmail }"
          />
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Reply-to (optional)</span>
        <input v-model="replyTo" name="replyTo" type="email" class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Preheader (optional)</span>
        <input
          v-model="preheader"
          name="preheader"
          type="text"
          maxlength="150"
          class="input input-bordered w-full"
        />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Subject</span>
        <input
          v-model="subject"
          name="subject"
          type="text"
          class="input input-bordered w-full"
          :class="{ 'input-error': errors.subject }"
        />
        <span v-if="errors.subject" class="mt-1 text-sm text-error">{{ errors.subject }}</span>
      </label>

      <label v-if="layouts.length > 0" class="form-control">
        <span class="label-text mb-1">Layout</span>
        <select
          v-model="selectedLayoutId"
          name="layoutId"
          class="select select-bordered w-full"
          :class="{ 'select-error': errors.layoutId }"
        >
          <option value="">None (custom HTML)</option>
          <option v-for="l in layouts" :key="l.id" :value="l.id">
            {{ l.name }}
          </option>
        </select>
        <span v-if="errors.layoutId" class="mt-1 text-sm text-error">{{ errors.layoutId }}</span>
      </label>

      <div v-if="selectedLayoutId">
        <div class="mb-1 flex items-center justify-between">
          <span class="label-text">Body</span>
          <VariablePicker :target="bodyContentEl" />
        </div>
        <p class="mb-1 text-xs opacity-60">
          Only this content changes between emails — the branding frame comes from the layout.
        </p>
        <textarea
          ref="bodyContentEl"
          v-model="bodyContent"
          name="bodyContent"
          rows="16"
          class="textarea textarea-bordered w-full font-mono text-sm"
          :class="{ 'textarea-error': errors.bodyContent }"
        />
        <span v-if="errors.bodyContent" class="mt-1 text-sm text-error">
          {{ errors.bodyContent }}
        </span>
      </div>

      <div v-else>
        <div class="mb-1 flex items-center justify-between">
          <span class="label-text">HTML content</span>
          <VariablePicker :target="htmlContentEl" />
        </div>
        <textarea
          ref="htmlContentEl"
          v-model="htmlContent"
          name="htmlContent"
          rows="16"
          class="textarea textarea-bordered w-full font-mono text-sm"
          :class="{ 'textarea-error': errors.htmlContent }"
        />
        <span v-if="errors.htmlContent" class="mt-1 text-sm text-error">
          {{ errors.htmlContent }}
        </span>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="label-text">Text content (optional)</span>
            <button
              type="button"
              class="btn btn-xs btn-secondary btn-outline"
              @click="openPreview('text')"
            >
              Preview
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-xs" @click="generateTextFromHtml">
              Generate from HTML
            </button>
            <VariablePicker :target="textContentEl" />
          </div>
        </div>
        <textarea
          ref="textContentEl"
          v-model="textContent"
          name="textContent"
          rows="6"
          class="textarea textarea-bordered w-full"
        />
      </div>

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">Save</button>
    </Form>

    <div v-if="previewOpen" class="modal modal-open">
      <div class="modal-box max-w-3xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold">Preview</h3>
          <div role="tablist" class="tabs tabs-boxed tabs-xs">
            <button
              type="button"
              role="tab"
              class="tab"
              :class="{ 'tab-active': previewTab === 'html' }"
              @click="previewTab = 'html'"
            >
              HTML
            </button>
            <button
              type="button"
              role="tab"
              class="tab"
              :class="{ 'tab-active': previewTab === 'text' }"
              @click="previewTab = 'text'"
            >
              Text
            </button>
          </div>
        </div>
        <iframe
          v-if="previewTab === 'html'"
          sandbox="allow-same-origin"
          :srcdoc="previewHtml ?? ''"
          class="h-96 w-full rounded-box border border-base-200 bg-white"
        />
        <pre
          v-else
          class="h-96 w-full overflow-auto rounded-box border border-base-200 bg-base-100 p-3 text-sm whitespace-pre-wrap"
          >{{ previewText ?? '(No text content)' }}</pre>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="previewOpen = false">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
