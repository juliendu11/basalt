<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import { Form } from '@adonisjs/inertia/vue'
import VariablePicker from '~/components/variable_picker.vue'

const props = defineProps<{
  project: { id: number; organizationId: number; name: string; slug: string }
}>()

const htmlContentEl = ref<HTMLTextAreaElement | null>(null)
const htmlContent = ref('')
const textContentEl = ref<HTMLTextAreaElement | null>(null)
const textContent = ref('')
const previewTab = ref<'html' | 'text'>('html')
const previewOpen = ref(false)
const EMAIL_BODY_PLACEHOLDER = '{{ email_body }}'

function openPreview(tab: 'html' | 'text') {
  previewTab.value = tab
  previewOpen.value = true
}
</script>

<template>
  <Head title="New email layout" />

  <div class="mx-auto px-4 pt-3 pb-10">
    <h1 class="mb-6 text-2xl font-semibold">New email layout</h1>

    <Form
      v-slot="{ processing, errors }"
      route="email_layouts.store"
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
            <VariablePicker :target="htmlContentEl" include-email-body />
          </div>
        </div>
        <p class="mb-1 text-xs opacity-60">
          This is the branding frame shared by every email using this layout. Place
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

      <button type="submit" class="btn btn-primary self-start" :disabled="processing">
        Create layout
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
          :srcdoc="htmlContent"
          class="h-96 w-full rounded-box border border-base-200 bg-white"
        />
        <pre
          v-else
          class="h-96 w-full overflow-auto rounded-box border border-base-200 bg-base-100 p-3 text-sm whitespace-pre-wrap"
          >{{ textContent || '(No text content)' }}</pre>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="previewOpen = false">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
