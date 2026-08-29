/**
 * Minimal ASCII slugify, no external dependency: lowercases, strips
 * diacritics, replaces anything that isn't `[a-z0-9]` with a single `-`,
 * trims leading/trailing `-`. Used wherever a human-entered name needs a
 * URL-safe slug (organizations, projects, docs/plans/03-organizations.md,
 * docs/plans/04-projects.md).
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
