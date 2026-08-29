<script setup lang="ts">
import { ref, computed } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import VariablePicker from '~/components/variable_picker.vue'
import { htmlToText } from '~/utils/html_to_text'

const props = defineProps<{
  project: {
    id: number
    organizationId: number
    name: string
    slug: string
    defaultSenderName: string | null
    defaultSenderEmail: string | null
  }
  templates: Array<{ id: number; name: string }>
  layouts: Array<{ id: number; name: string; htmlContent: string; textContent: string | null }>
}>()

const mode = ref<'blank' | 'template' | 'layout'>('blank')
const htmlContentEl = ref<HTMLTextAreaElement | null>(null)
const htmlContent = ref('')
const bodyContentEl = ref<HTMLTextAreaElement | null>(null)
const bodyContent = ref('')
const subject = ref('')
const senderName = ref(props.project.defaultSenderName ?? '')
const senderEmail = ref(props.project.defaultSenderEmail ?? '')
const textContentEl = ref<HTMLTextAreaElement | null>(null)
const textContent = ref('')
const previewTab = ref<'html' | 'text'>('html')
const previewOpen = ref(false)
const selectedLayoutId = ref<number | null>(props.layouts[0]?.id ?? null)

const selectedLayout = computed(() => props.layouts.find((l) => l.id === selectedLayoutId.value))

/** Mirrors the backend's `email_layout_composer.ts` for a client-side preview (no Email exists yet to preview server-side). */
const layoutPreviewHtml = computed(() =>
  selectedLayout.value
    ? selectedLayout.value.htmlContent.replace(/\{\{\s*email_body\s*\}\}/g, () => bodyContent.value)
    : ''
)

/** Text-mode counterpart of `layoutPreviewHtml` — mirrors `composeEmailText()`. */
const layoutPreviewText = computed(() =>
  selectedLayout.value?.textContent
    ? selectedLayout.value.textContent.replace(/\{\{\s*email_body\s*\}\}/g, () => textContent.value)
    : textContent.value
)

/**
 * Mirrors `variable_renderer.ts`'s `subject` token resolution for this
 * client-side preview (no Email exists yet to preview server-side) — only
 * substituted once the user has actually filled in a subject, otherwise the
 * token is left as-is, same as an unresolved token server-side.
 */
const previewHtml = computed(() => {
  const html = mode.value === 'layout' ? layoutPreviewHtml.value : htmlContent.value
  return subject.value ? html.replace(/\{\{\s*subject\s*\}\}/g, () => subject.value) : html
})

/** Text-mode counterpart of `previewHtml`. */
const previewText = computed(() => {
  const text = mode.value === 'layout' ? layoutPreviewText.value : textContent.value
  return subject.value ? text.replace(/\{\{\s*subject\s*\}\}/g, () => subject.value) : text
})

function openPreview(tab: 'html' | 'text') {
  previewTab.value = tab
  previewOpen.value = true
}

/**
 * In layout mode, converts only `bodyContent` (this email's own fragment) —
 * mirroring `bodyContent`/`htmlContent`, `textContent` here holds just the
 * fragment too. The layout's own text frame is applied on top of it
 * separately at preview/send time (`composeEmailText`,
 * `email_layout_composer.ts`), never edited from this page.
 */
function generateTextFromHtml() {
  textContent.value = htmlToText(mode.value === 'layout' ? bodyContent.value : htmlContent.value)
}
</script>

<template>
  <Head title="New email" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New email</h1>

    <div role="tablist" class="tabs tabs-boxed mb-6 max-w-md">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab-active': mode === 'blank' }"
        @click="mode = 'blank'"
      >
        Blank
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab-active': mode === 'template' }"
        :disabled="templates.length === 0"
        @click="mode = 'template'"
      >
        From a template
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab-active': mode === 'layout' }"
        :disabled="layouts.length === 0"
        @click="mode = 'layout'"
      >
        From a layout
      </button>
    </div>

    <Form
      v-slot="{ processing, errors }"
      route="emails.store"
      :params="{ organizationId: props.project.organizationId, projectId: props.project.id }"
      class="flex flex-col gap-4"
    >
      <label v-if="mode === 'template'" class="form-control">
        <span class="label-text mb-1">Template</span>
        <select name="templateId" class="select select-bordered w-full">
          <option v-for="template in templates" :key="template.id" :value="template.id">
            {{ template.name }}
          </option>
        </select>
      </label>

      <label v-if="mode === 'layout'" class="form-control">
        <span class="label-text mb-1">Layout</span>
        <select v-model="selectedLayoutId" name="layoutId" class="select select-bordered w-full">
          <option v-for="layout in layouts" :key="layout.id" :value="layout.id">
            {{ layout.name }}
          </option>
        </select>
      </label>

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
        <input name="replyTo" type="email" class="input input-bordered w-full" />
      </label>

      <label class="form-control">
        <span class="label-text mb-1">Preheader (optional)</span>
        <input name="preheader" type="text" maxlength="150" class="input input-bordered w-full" />
      </label>

      <label v-if="mode !== 'template'" class="form-control">
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

      <template v-if="mode === 'blank'">
        <div>
          <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="label-text">HTML content</span>
              <button
                type="button"
                class="btn btn-xs btn-secondary btn-outline"
                @click="openPreview('html')"
              >
                Preview
              </button>
            </div>
            <div class="flex items-center gap-2">
              <VariablePicker :target="htmlContentEl" />
            </div>
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
      </template>

      <template v-else-if="mode === 'layout'">
        <div>
          <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="label-text">Body</span>
              <button
                type="button"
                class="btn btn-xs btn-secondary btn-outline"
                @click="openPreview('html')"
              >
                Preview
              </button>
            </div>
            <div class="flex items-center gap-2">
              <VariablePicker :target="bodyContentEl" />
            </div>
          </div>
          <p class="mb-1 text-xs opacity-60">
            Only this content changes between emails — the branding frame comes from the layout.
          </p>
          <textarea
            ref="bodyContentEl"
            v-model="bodyContent"
            name="bodyContent"
            rows="12"
            class="textarea textarea-bordered w-full font-mono text-sm"
            :class="{ 'textarea-error': errors.bodyContent }"
          />
          <span v-if="errors.bodyContent" class="mt-1 text-sm text-error">
            {{ errors.bodyContent }}
          </span>
        </div>
      </template>

      <div v-if="mode !== 'template'">
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

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">
        Create email
      </button>
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
          :srcdoc="previewHtml"
          class="h-96 w-full rounded-box border border-base-200 bg-white"
        />
        <pre
          v-else
          class="h-96 w-full overflow-auto rounded-box border border-base-200 bg-base-100 p-3 text-sm whitespace-pre-wrap"
          >{{ previewText || '(No text content)' }}</pre>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="previewOpen = false">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
