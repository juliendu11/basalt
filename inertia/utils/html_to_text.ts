/**
 * Backs the "Generate from HTML" button on email/template forms — derives a
 * readable plain-text fallback from the HTML content. `textContent` on a
 * parsed DOM concatenates every text node with no regard for block
 * boundaries (e.g. `<p>A</p><p>B</p>` collapses to `AB`), so block elements
 * and `<br>` are turned into newlines first, then whitespace is normalized:
 * runs of spaces/tabs collapsed, each line trimmed, and consecutive blank
 * lines collapsed to a single one.
 */
const BLOCK_SELECTOR =
  'p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, section, article, header, footer, table'

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  /**
   * `textContent` only reads visible text, so a `{{ unsubscribe_url }}`
   * token placed in an `<a href>` (its normal usage — see VariablePicker)
   * would otherwise vanish from the plain-text version entirely, silently
   * dropping the one link plain-text emails still need to be clickable.
   * Surfacing every non-anchor href as text fixes that case generally.
   */
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')?.trim()
    const text = a.textContent?.trim()
    if (!href || href.startsWith('#') || href === text) return

    a.append(` (${href})`)
  })

  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.querySelectorAll(BLOCK_SELECTOR).forEach((el) => el.append('\n'))

  const lines = (doc.body.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())

  const collapsed = lines.reduce<string[]>((acc, line) => {
    if (line === '' && acc[acc.length - 1] === '') return acc
    acc.push(line)
    return acc
  }, [])

  return collapsed.join('\n').trim()
}
