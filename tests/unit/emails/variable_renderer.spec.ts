import { test } from '@japa/runner'
import {
  renderVariables,
  renderTextVariables,
  type VariableContext,
} from '#services/emails/variable_renderer'

const context: VariableContext = {
  contact: {
    firstname: 'Jean',
    lastname: 'Dupont',
    email: 'jean.dupont@example.com',
    phone: '+33 6 12 34 56 78',
    company: 'Acme Inc',
    country: 'France',
    city: 'Paris',
    language: 'fr',
    timezone: 'Europe/Paris',
  },
  project: { name: 'Marketing' },
  subject: 'Your monthly update',
  unsubscribeUrl: 'https://example.com/unsubscribe/abc',
}

test.group('renderVariables', () => {
  test('resolves every contact.* namespace field', ({ assert }) => {
    assert.equal(renderVariables('{{ contact.firstname }}', context), 'Jean')
    assert.equal(renderVariables('{{ contact.lastname }}', context), 'Dupont')
    assert.equal(renderVariables('{{ contact.email }}', context), 'jean.dupont@example.com')
    assert.equal(renderVariables('{{ contact.phone }}', context), '+33 6 12 34 56 78')
    assert.equal(renderVariables('{{ contact.company }}', context), 'Acme Inc')
    assert.equal(renderVariables('{{ contact.country }}', context), 'France')
    assert.equal(renderVariables('{{ contact.city }}', context), 'Paris')
    assert.equal(renderVariables('{{ contact.language }}', context), 'fr')
    assert.equal(renderVariables('{{ contact.timezone }}', context), 'Europe/Paris')
  })

  test('resolves project.name', ({ assert }) => {
    assert.equal(renderVariables('Hello from {{ project.name }}', context), 'Hello from Marketing')
  })

  test('resolves subject without a namespace', ({ assert }) => {
    assert.equal(renderVariables('{{ subject }}', context), 'Your monthly update')
  })

  test('resolves unsubscribe_url without a namespace', ({ assert }) => {
    assert.equal(
      renderVariables('{{ unsubscribe_url }}', context),
      'https://example.com/unsubscribe/abc'
    )
  })

  test('tolerates extra whitespace inside the token', ({ assert }) => {
    assert.equal(renderVariables('{{   contact.firstname   }}', context), 'Jean')
  })

  test('an unknown or misspelled token is left literally in the output', ({ assert }) => {
    assert.equal(
      renderVariables('Hi {{ contct.firstname }}!', context),
      'Hi {{ contct.firstname }}!'
    )
    assert.equal(renderVariables('{{ campaign.name }}', context), '{{ campaign.name }}')
  })

  test('HTML-escapes injected variable values (XSS)', ({ assert }) => {
    const malicious: VariableContext = {
      ...context,
      contact: { ...context.contact, firstname: '<script>alert(1)</script>' },
    }

    const rendered = renderVariables('Hello {{ contact.firstname }}', malicious)

    assert.notInclude(rendered, '<script>')
    assert.include(rendered, '&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('unsubscribe_url is never HTML-escaped, even if it contained special characters', ({
    assert,
  }) => {
    const withAmpersand: VariableContext = {
      ...context,
      unsubscribeUrl: 'https://example.com/unsubscribe?token=abc&ref=email',
    }

    assert.equal(
      renderVariables('{{ unsubscribe_url }}', withAmpersand),
      'https://example.com/unsubscribe?token=abc&ref=email'
    )
  })
})

test.group('renderTextVariables', () => {
  test('resolves tokens the same way as renderVariables', ({ assert }) => {
    assert.equal(renderTextVariables('{{ contact.firstname }}', context), 'Jean')
    assert.equal(
      renderTextVariables('Hello from {{ project.name }}', context),
      'Hello from Marketing'
    )
    assert.equal(renderTextVariables('{{ subject }}', context), 'Your monthly update')
  })

  test('an unknown or misspelled token is left literally in the output', ({ assert }) => {
    assert.equal(
      renderTextVariables('Hi {{ contct.firstname }}!', context),
      'Hi {{ contct.firstname }}!'
    )
  })

  test('never HTML-escapes injected variable values, unlike renderVariables', ({ assert }) => {
    const special: VariableContext = {
      ...context,
      contact: { ...context.contact, company: 'Smith & Sons' },
    }

    assert.equal(
      renderTextVariables('Hello from {{ contact.company }}', special),
      'Hello from Smith & Sons'
    )
  })

  test('unsubscribe_url is passed through as-is, same as renderVariables', ({ assert }) => {
    const withAmpersand: VariableContext = {
      ...context,
      unsubscribeUrl: 'https://example.com/unsubscribe?token=abc&ref=email',
    }

    assert.equal(
      renderTextVariables('{{ unsubscribe_url }}', withAmpersand),
      'https://example.com/unsubscribe?token=abc&ref=email'
    )
  })
})
