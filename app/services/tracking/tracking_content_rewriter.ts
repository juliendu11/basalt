const BODY_CLOSE_TAG = /<\/body\s*>/i

// Matches an <a ...href="..."...> opening tag, capturing the href value
// (single- or double-quoted) so it can be replaced in place. Deliberately a
// regex rather than a full HTML parser (no such dependency exists in this
// project): this operates on already-authored `email_deliveries`-bound
// content the app itself produced (frozen `campaign_nodes.config.htmlContent`,
// docs/plans/decisions/ADR-004-campaign-versioning.md), not arbitrary
// untrusted third-party HTML — a full parser would be disproportionate.
const ANCHOR_HREF_PATTERN = /(<a\b[^>]*\bhref\s*=\s*)(["'])(.*?)\2/gi

/**
 * Post-processes a frozen email's HTML just before sending
 * (docs/plans/16-email-tracking.md § Domain concepts, § User flows):
 * inserts an invisible open-tracking pixel and rewrites every absolute
 * http(s) link to a tracked redirect. Only `send_email_executor.ts` calls
 * this, and only on a LOCAL COPY of the frozen content — the published
 * `campaign_nodes.config` itself is never mutated.
 */
export default class TrackingContentRewriter {
  rewrite(html: string, deliveryToken: string, baseUrl: string): string {
    const withPixel = this.#insertPixel(html, deliveryToken, baseUrl)
    return this.#rewriteLinks(withPixel, deliveryToken, baseUrl)
  }

  #insertPixel(html: string, deliveryToken: string, baseUrl: string): string {
    const pixel =
      `<img src="${baseUrl}/track/open/${deliveryToken}.gif" width="1" height="1" ` +
      `alt="" style="display:none" />`

    if (BODY_CLOSE_TAG.test(html)) {
      return html.replace(BODY_CLOSE_TAG, (match) => `${pixel}${match}`)
    }

    return `${html}${pixel}`
  }

  #rewriteLinks(html: string, deliveryToken: string, baseUrl: string): string {
    return html.replace(ANCHOR_HREF_PATTERN, (match, prefix, quote, href) => {
      if (!this.#isAbsoluteHttpUrl(href)) return match

      const trackedUrl = `${baseUrl}/track/click/${deliveryToken}?u=${encodeURIComponent(href)}`
      return `${prefix}${quote}${trackedUrl}${quote}`
    })
  }

  #isAbsoluteHttpUrl(href: string): boolean {
    try {
      const url = new URL(href)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }
}
