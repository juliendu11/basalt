import { parse, NodeType } from 'node-html-parser'
import type { HTMLElement, TextNode } from 'node-html-parser'

const TOKEN_PATTERN = /\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g
const PLACEHOLDER_PATTERN = /¤VAR(\d+)¤/g

/** Text inside these never reaches the translator — it isn't user copy. */
const SKIP_TAGS = new Set(['script', 'style'])

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

/**
 * Swaps every `{{ token }}` (docs/plans/08-email-templates.md § Domain
 * concepts) for a placeholder unlikely to be reworded by machine
 * translation, so `{{ contact.firstname }}` has a good chance of surviving
 * the round trip intact. Best-effort only — no translation API guarantees a
 * placeholder is left untouched.
 */
function protectTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = []
  const masked = text.replace(TOKEN_PATTERN, (match) => {
    tokens.push(match)
    return `¤VAR${tokens.length - 1}¤`
  })
  return { masked, tokens }
}

function restoreTokens(text: string, tokens: string[]): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, index) => tokens[Number(index)] ?? match)
}

function collectTextNodes(node: HTMLElement, out: TextNode[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const textNode = child as TextNode
      /**
       * `<!DOCTYPE html>` parses as a plain TEXT_NODE (nodeType 3, same as
       * real copy) rather than its own node type — excluded by prefix so a
       * translation pass can't corrupt the doctype declaration.
       */
      if (!textNode.isWhitespace && !textNode.rawText.trimStart().startsWith('<!')) {
        out.push(textNode)
      }
    } else if (child.nodeType === NodeType.ELEMENT_NODE) {
      const element = child as HTMLElement
      if (!SKIP_TAGS.has(element.tagName?.toLowerCase() ?? '')) {
        collectTextNodes(element, out)
      }
    }
  }
}

export type BatchTranslate = (texts: string[]) => Promise<string[]>

/**
 * Translates every visible text node of an HTML email, leaving tags,
 * attributes, `<script>`/`<style>` contents, and `{{ variable }}` tokens
 * untouched — only the copy a recipient actually reads changes
 * (docs/plans/09-emails.md § Clone in another language).
 */
export async function translateHtml(html: string, translate: BatchTranslate): Promise<string> {
  const root = parse(html, { comment: true })
  const textNodes: TextNode[] = []
  collectTextNodes(root, textNodes)

  if (textNodes.length === 0) return html

  const protections = textNodes.map((node) => protectTokens(node.text))
  const translations = await translate(protections.map((p) => p.masked))

  textNodes.forEach((node, index) => {
    const translated = translations[index] ?? protections[index].masked
    node.rawText = escapeHtml(restoreTokens(translated, protections[index].tokens))
  })

  return root.toString()
}

/** Same token-protection pass as `translateHtml`, for plain-text content. */
export async function translatePlainText(text: string, translate: BatchTranslate): Promise<string> {
  if (text.trim() === '') return text

  const { masked, tokens } = protectTokens(text)
  const [translated] = await translate([masked])
  return restoreTokens(translated ?? masked, tokens)
}
