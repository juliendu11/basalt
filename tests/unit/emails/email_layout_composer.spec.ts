import { test } from '@japa/runner'
import { composeEmailHtml, composeEmailText } from '#services/emails/email_layout_composer'

test.group('composeEmailHtml', () => {
  test('returns the email htmlContent as-is when there is no layout', ({ assert }) => {
    const html = composeEmailHtml({ htmlContent: '<p>Hi</p>', bodyContent: null }, null)
    assert.equal(html, '<p>Hi</p>')
  })

  test('substitutes {{ email_body }} in the layout frame with bodyContent', ({ assert }) => {
    const html = composeEmailHtml(
      { htmlContent: null, bodyContent: '<p>Hi</p>' },
      { htmlContent: '<header>Acme</header>{{ email_body }}<footer>Bye</footer>' }
    )
    assert.equal(html, '<header>Acme</header><p>Hi</p><footer>Bye</footer>')
  })
})

test.group('composeEmailText', () => {
  test('returns the email textContent as-is when there is no layout', ({ assert }) => {
    const text = composeEmailText({ textContent: 'Hi there' }, null)
    assert.equal(text, 'Hi there')
  })

  test('returns null when there is no layout and no textContent', ({ assert }) => {
    const text = composeEmailText({ textContent: null }, null)
    assert.isNull(text)
  })

  test('substitutes {{ email_body }} in the layout text frame with the email fragment', ({
    assert,
  }) => {
    const text = composeEmailText(
      { textContent: 'Hi there' },
      { textContent: 'Acme\n{{ email_body }}\nUnsubscribe: {{ unsubscribe_url }}' }
    )
    assert.equal(text, 'Acme\nHi there\nUnsubscribe: {{ unsubscribe_url }}')
  })

  test('falls back to the raw email fragment when the layout has no text frame', ({ assert }) => {
    const text = composeEmailText({ textContent: 'Hi there' }, { textContent: null })
    assert.equal(text, 'Hi there')
  })
})
