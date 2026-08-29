<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import VariablePicker from '~/components/variable_picker.vue'
import { csrfHeaders } from '~/utils/csrf'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
  layout: {
    id: number
    name: string
    htmlContent: string
    textContent: string | null
  }
}>()

const name = ref(props.layout.name)
const htmlContentEl = ref<HTMLTextAreaElement | null>(null)
const htmlContent = ref(props.layout.htmlContent)
const textContentEl = ref<HTMLTextAreaElement | null>(null)
const textContent = ref(props.layout.textContent ?? '')
const previewHtml = ref<string | null>(null)
const previewText = ref<string | null>(null)
const previewTab = ref<'html' | 'text'>('html')
const previewOpen = ref(false)
const EMAIL_BODY_PLACEHOLDER = '{{ email_body }}'

async function openPreview(tab: 'html' | 'text' = 'html') {
  const response = await fetch(
    `/organizations/${props.project.organizationId}/projects/${props.project.id}/email-layouts/${props.layout.id}/preview`,
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
  <Head title="Edit email layout" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="mb-8 text-2xl font-semibold">Edit email layout</h1>
      <button type="button" class="btn btn-sm" @click="openPreview('html')">Preview</button>
    </div>

    <Form
      v-slot="{ processing, errors }"
      method="patch"
      route="email_layouts.update"
      :params="{
        organizationId: props.project.organizationId,
        projectId: props.project.id,
        layoutId: props.layout.id,
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

      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="label-text">HTML content</span>
          <VariablePicker :target="htmlContentEl" include-email-body />
        </div>
        <p class="mb-1 text-xs opacity-60">
          This is the branding frame shared by every email using this layout — editing it instantly
          applies to all of them. Place
          <code>{{ EMAIL_BODY_PLACEHOLDER }}</code> where each email's own content should appear.
        </p>
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
          <VariablePicker :target="textContentEl" include-email-body />
        </div>
        <p class="mb-1 text-xs opacity-60">
          Plain-text counterpart of the branding frame above, for text-only email clients. Place
          <code>{{ EMAIL_BODY_PLACEHOLDER }}</code> where each email's own text content should
          appear. Leave empty to send each email's text content as-is, with no frame.
        </p>
        <textarea
          ref="textContentEl"
          v-model="textContent"
          name="textContent"
          rows="6"
          class="textarea textarea-bordered w-full font-mono text-sm"
          :class="{ 'textarea-error': errors.textContent }"
        />
        <span v-if="errors.textContent" class="mt-1 text-sm text-error">
          {{ errors.textContent }}
        </span>
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
        <!--
          `sandbox="allow-same-origin"` WITHOUT `allow-scripts` — defense in
          depth so any <script> that slipped through cannot execute, even
          though VariableRenderer already HTML-escapes injected values
          (docs/plans/08-email-templates.md § Security considerations).
        -->
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
