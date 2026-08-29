import { test } from '@japa/runner'
import TrackingContentRewriter from '#services/tracking/tracking_content_rewriter'

const rewriter = new TrackingContentRewriter()
const BASE_URL = 'https://app.example.test'
const TOKEN = 'abc123.def456'

test.group('TrackingContentRewriter', () => {
  test('inserts the open-tracking pixel just before </body>', ({ assert }) => {
    const html = '<html><body><p>Hello</p></body></html>'
    const result = rewriter.rewrite(html, TOKEN, BASE_URL)

    assert.include(result, `<img src="${BASE_URL}/track/open/${TOKEN}.gif"`)
    assert.isTrue(result.indexOf('<img') < result.indexOf('</body>'))
  })

  test('appends the pixel at the end when there is no </body> tag', ({ assert }) => {
    const html = '<p>No body tag here</p>'
    const result = rewriter.rewrite(html, TOKEN, BASE_URL)

    assert.isTrue(result.startsWith(html))
    assert.include(result, `<img src="${BASE_URL}/track/open/${TOKEN}.gif"`)
  })

  test('rewrites every absolute http(s) link to a tracked redirect', ({ assert }) => {
    const html = '<a href="https://example.com/a">A</a><a href="http://example.com/b">B</a></body>'
    const result = rewriter.rewrite(html, TOKEN, BASE_URL)

    assert.include(
      result,
      `href="${BASE_URL}/track/click/${TOKEN}?u=${encodeURIComponent('https://example.com/a')}"`
    )
    assert.include(
      result,
      `href="${BASE_URL}/track/click/${TOKEN}?u=${encodeURIComponent('http://example.com/b')}"`
    )
  })

  test('leaves non-http(s) hrefs untouched', ({ assert }) => {
    const html =
      '<a href="mailto:hello@example.com">Mail</a>' +
      '<a href="tel:+123456789">Call</a>' +
      '<a href="#section">Anchor</a></body>'
    const result = rewriter.rewrite(html, TOKEN, BASE_URL)

    assert.include(result, 'href="mailto:hello@example.com"')
    assert.include(result, 'href="tel:+123456789"')
    assert.include(result, 'href="#section"')
    assert.notInclude(result, '/track/click/')
  })

  test('preserves the rest of the HTML unchanged apart from the pixel and rewritten links', ({
    assert,
  }) => {
    const html = '<html><body><h1>Title</h1><p>Some text with no links.</p></body></html>'
    const result = rewriter.rewrite(html, TOKEN, BASE_URL)

    assert.include(result, '<h1>Title</h1>')
    assert.include(result, '<p>Some text with no links.</p>')
  })
})
