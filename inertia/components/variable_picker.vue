<script setup lang="ts">
/**
 * Inserts a `{{ namespace.field }}` token at the current cursor position of
 * a target `<textarea>` (docs/plans/08-email-templates.md § Frontend
 * architecture). The parent owns the textarea via a template ref and passes
 * it in — this component never touches Vue reactivity for the textarea's
 * value, it edits the DOM element directly and dispatches an `input` event
 * so the parent's own listeners (if any) see the change.
 */
const props = withDefaults(
  defineProps<{ target: HTMLTextAreaElement | null; includeEmailBody?: boolean }>(),
  { includeEmailBody: false }
)

const VARIABLES = [
  { token: 'contact.firstname', label: 'First name' },
  { token: 'contact.lastname', label: 'Last name' },
  { token: 'contact.email', label: 'Email' },
  { token: 'contact.company', label: 'Company' },
  { token: 'contact.country', label: 'Country' },
  { token: 'contact.city', label: 'City' },
  { token: 'project.name', label: 'Project name' },
  { token: 'subject', label: 'Subject' },
  { token: 'unsubscribe_url', label: 'Unsubscribe link' },
  /**
   * Only offered on an EmailLayout's HTML editor (`includeEmailBody`) —
   * the reserved placeholder each linked Email's `bodyContent` is slotted
   * into (`email_layout_composer.ts`), not a real variable namespace.
   */
  ...(props.includeEmailBody ? [{ token: 'email_body', label: 'Email body (required)' }] : []),
] as const

function insert(token: string) {
  const el = props.target
  if (!el) return

  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const snippet = `{{ ${token} }}`

  el.value = el.value.slice(0, start) + snippet + el.value.slice(end)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  const cursor = start + snippet.length
  el.setSelectionRange(cursor, cursor)
}
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="variable in VARIABLES"
      :key="variable.token"
      type="button"
      class="btn btn-xs"
      @click="insert(variable.token)"
    >
      {{ variable.label }}
    </button>
  </div>
</template>
