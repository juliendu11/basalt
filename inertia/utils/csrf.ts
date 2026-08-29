/**
 * Reads the `XSRF-TOKEN` cookie set by Shield (`config/shield.ts`,
 * `enableXsrfCookie: true`) for plain `fetch()` calls that aren't routed
 * through Inertia's `<Form>`/`router` (which already attach it
 * automatically) — used by the SMTP "test connection" actions
 * (docs/plans/07-smtp-connectors.md § User flows).
 */
export function csrfHeaders(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  if (!match) return {}

  return { 'X-XSRF-TOKEN': decodeURIComponent(match[1]) }
}
