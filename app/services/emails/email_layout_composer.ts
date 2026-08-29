/**
 * Composes the final `htmlContent` for a layout-linked `Email` by
 * substituting the reserved `{{ email_body }}` placeholder in the
 * `EmailLayout`'s branding frame with the email's own `bodyContent`
 * (docs/plans/08b-email-layouts.md § Domain concepts).
 *
 * Runs BEFORE `renderVariables` (`variable_renderer.ts`): the placeholder is
 * a structural marker, not a data variable, so its substitution is a plain,
 * unescaped string replace — `bodyContent` is trusted HTML authored by the
 * same project user as the layout, not third-party data. Any `{{ }}` tokens
 * carried over from either the layout or the body (e.g. `{{ contact.firstname }}`)
 * survive this pass untouched and are rendered together in the subsequent
 * `renderVariables` call, exactly like a non-layout Email.
 *
 * Deliberately re-read live from the `EmailLayout` on every call (preview,
 * publish-time freeze) rather than cached on the `Email` — this is what
 * makes the branding frame "live": editing a layout's `htmlContent`
 * instantly applies to every `Email` that references it, until the
 * containing campaign version is published and its `send_email` node
 * freezes a snapshot (decisions/ADR-004-campaign-versioning.md), same as
 * every other Email field.
 */
const EMAIL_BODY_TOKEN = /\{\{\s*email_body\s*\}\}/g

/** Shown when composing a layout's own preview, outside the context of any real Email. */
export const EXAMPLE_BODY_CONTENT = '<p>Your email content will appear here.</p>'

/** Shown when composing a layout's own text preview, outside the context of any real Email. */
export const EXAMPLE_BODY_TEXT_CONTENT = 'Your email content will appear here.'

export function composeEmailHtml(
  email: { htmlContent: string | null; bodyContent: string | null },
  layout: { htmlContent: string } | null
): string {
  if (!layout) return email.htmlContent ?? ''

  return layout.htmlContent.replace(EMAIL_BODY_TOKEN, () => email.bodyContent ?? '')
}

/**
 * Text-mode counterpart of `composeEmailHtml()` — substitutes the same
 * `{{ email_body }}` placeholder, this time in the `EmailLayout`'s
 * `textContent` frame (its plain-text branding, e.g. a footer/unsubscribe
 * line meant for text-only clients), with the email's own `textContent`
 * (which, for a layout-linked `Email`, holds just its own text fragment —
 * the exact same body/frame split `bodyContent`/`htmlContent` use).
 *
 * A layout's `textContent` is optional (existing layouts predate this field,
 * and not every layout needs a distinct text frame) — falls back to the raw
 * email fragment when the layout has none, same as the no-layout case,
 * rather than forcing every layout to define one.
 */
export function composeEmailText(
  email: { textContent: string | null },
  layout: { textContent: string | null } | null
): string | null {
  if (!layout?.textContent) return email.textContent ?? null

  return layout.textContent.replace(EMAIL_BODY_TOKEN, () => email.textContent ?? '')
}
