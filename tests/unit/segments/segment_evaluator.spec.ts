import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import OrganizationService from '#services/organizations/organization_service'
import ProjectService from '#services/projects/project_service'
import ContactService from '#services/contacts/contact_service'
import ContactTagService from '#services/contacts/contact_tag_service'
import Contact from '#models/contact'
import { toQuery } from '#services/segments/segment_evaluator'
import type { SegmentDefinition } from '#types/segment_definition'

const organizationService = new OrganizationService()
const projectService = new ProjectService()
const contactService = new ContactService()
const contactTagService = new ContactTagService()

async function createProject() {
  const owner = await UserFactory.create()
  const organization = await organizationService.create(owner, { name: 'Acme' })
  const project = await projectService.create(organization, owner, {
    name: 'Marketing',
    timezone: 'Europe/Paris',
  })
  return { owner, organization, project }
}

async function matchingEmails(
  project: { id: number },
  definition: SegmentDefinition,
  customFieldTypes: Record<string, 'text' | 'number' | 'boolean' | 'date'> = {}
) {
  const query = Contact.query().withScopes((scopes) => scopes.forProject(project as never))
  toQuery(definition, query, customFieldTypes)
  const rows = await query.orderBy('email', 'asc')
  return rows.map((row) => row.email)
}

test.group('SegmentEvaluator', () => {
  test('empty conditions matches every contact of the project', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com' })
    await contactService.create(project, owner, { email: 'b@example.com' })

    const emails = await matchingEmails(project, { combinator: 'AND', conditions: [] })

    assert.deepEqual(emails, ['a@example.com', 'b@example.com'])
  })

  test('equals on a standard field', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })

    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    })

    assert.deepEqual(emails, ['a@example.com'])
  })

  test('not_equals excludes the matching value', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })

    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'not_equals', value: 'France' }],
    })

    assert.deepEqual(emails, ['b@example.com'])
  })

  test('contains / starts_with / ends_with', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'jane.doe@example.com' })
    await contactService.create(project, owner, { email: 'john@other.com' })

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'email', operator: 'contains', value: 'doe' }],
      }),
      ['jane.doe@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'email', operator: 'starts_with', value: 'jane' }],
      }),
      ['jane.doe@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'email', operator: 'ends_with', value: 'other.com' }],
      }),
      ['john@other.com']
    )
  })

  test('not_contains', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'jane.doe@example.com' })
    await contactService.create(project, owner, { email: 'john@other.com' })

    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'email', operator: 'not_contains', value: 'doe' }],
    })

    assert.deepEqual(emails, ['john@other.com'])
  })

  test('a value containing LIKE wildcards is matched literally, not as a wildcard', async ({
    assert,
  }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', company: '100%_Sure' })
    await contactService.create(project, owner, { email: 'b@example.com', company: 'Sure Corp' })

    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'company', operator: 'equals', value: '100%_Sure' }],
    })

    assert.deepEqual(emails, ['a@example.com'])
  })

  test('greater_than / less_than', async ({ assert }) => {
    const { owner, project } = await createProject()
    const jane = await contactService.create(project, owner, { email: 'a@example.com' })
    const john = await contactService.create(project, owner, { email: 'b@example.com' })

    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'id', operator: 'greater_than', value: jane.id } as never],
    })

    assert.deepEqual(emails, [john.email])
  })

  test('before / after on a date field', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com' })

    const beforeFarFuture = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'createdAt', operator: 'before', value: '2999-01-01' }],
    })
    assert.deepEqual(beforeFarFuture, ['a@example.com'])

    const afterFarFuture = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [{ field: 'createdAt', operator: 'after', value: '2999-01-01' }],
    })
    assert.deepEqual(afterFarFuture, [])
  })

  test('is_null / is_not_null', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', company: 'Acme' })
    await contactService.create(project, owner, { email: 'b@example.com' })

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'company', operator: 'is_null' }],
      }),
      ['b@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'company', operator: 'is_not_null' }],
      }),
      ['a@example.com']
    )
  })

  test('in / not_in', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(project, owner, { email: 'b@example.com', country: 'Spain' })
    await contactService.create(project, owner, { email: 'c@example.com', country: 'Italy' })

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'country', operator: 'in', value: ['France', 'Italy'] }],
      }),
      ['a@example.com', 'c@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'country', operator: 'not_in', value: ['France', 'Italy'] }],
      }),
      ['b@example.com']
    )
  })

  test('nested AND/OR groups', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, {
      email: 'a@example.com',
      country: 'France',
      company: 'Acme',
    })
    await contactService.create(project, owner, {
      email: 'b@example.com',
      country: 'France',
      company: 'Other',
    })
    await contactService.create(project, owner, {
      email: 'c@example.com',
      country: 'Spain',
      company: 'Acme',
    })

    // country = France AND (company = Acme OR company = Other) -> a, b
    const emails = await matchingEmails(project, {
      combinator: 'AND',
      conditions: [
        { field: 'country', operator: 'equals', value: 'France' },
        {
          combinator: 'OR',
          conditions: [
            { field: 'company', operator: 'equals', value: 'Acme' },
            { field: 'company', operator: 'equals', value: 'Other' },
          ],
        },
      ],
    })

    assert.deepEqual(emails, ['a@example.com', 'b@example.com'])
  })

  test('a root-level OR never leaks into the caller-supplied project scope', async ({ assert }) => {
    const { owner, project } = await createProject()
    const { project: otherProject } = await createProject()
    await contactService.create(project, owner, { email: 'a@example.com', country: 'France' })
    await contactService.create(otherProject, owner, { email: 'z@other.com', country: 'Nowhere' })

    // A root-level OR with a condition that's trivially always-true
    // (email not_equals a value that doesn't exist) must still never surface
    // the other project's contact.
    const emails = await matchingEmails(project, {
      combinator: 'OR',
      conditions: [
        { field: 'country', operator: 'equals', value: 'France' },
        { field: 'email', operator: 'not_equals', value: 'nonexistent@example.com' },
      ],
    })

    assert.deepEqual(emails, ['a@example.com'])
  })

  test('customFields.* equals/contains/is_null', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, {
      email: 'a@example.com',
      customFields: { plan: 'pro' },
    })
    await contactService.create(project, owner, {
      email: 'b@example.com',
      customFields: { plan: 'free' },
    })
    await contactService.create(project, owner, { email: 'c@example.com' })

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'customFields.plan', operator: 'equals', value: 'pro' }],
      }),
      ['a@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'customFields.plan', operator: 'contains', value: 'ro' }],
      }),
      ['a@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'customFields.plan', operator: 'is_null' }],
      }),
      ['c@example.com']
    )
  })

  test('rejects a custom field key that is not a safe identifier', async ({ assert }) => {
    const { project } = await createProject()
    const query = Contact.query().withScopes((scopes) => scopes.forProject(project))
    toQuery(
      {
        combinator: 'AND',
        conditions: [
          { field: 'customFields.bad key; DROP TABLE contacts;--', operator: 'equals', value: 'x' },
        ],
      },
      query
    )

    await assert.rejects(() => query.exec())
  })

  test('greater_than / less_than on a number custom field', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, {
      email: 'a@example.com',
      customFields: { age: 17 },
    })
    await contactService.create(project, owner, {
      email: 'b@example.com',
      customFields: { age: 25 },
    })
    await contactService.create(project, owner, {
      email: 'c@example.com',
      customFields: { age: 40 },
    })

    assert.deepEqual(
      await matchingEmails(
        project,
        {
          combinator: 'AND',
          conditions: [{ field: 'customFields.age', operator: 'greater_than', value: 20 }],
        },
        { age: 'number' }
      ),
      ['b@example.com', 'c@example.com']
    )

    assert.deepEqual(
      await matchingEmails(
        project,
        {
          combinator: 'AND',
          conditions: [{ field: 'customFields.age', operator: 'less_than', value: 20 }],
        },
        { age: 'number' }
      ),
      ['a@example.com']
    )
  })

  test('before / after on a date custom field', async ({ assert }) => {
    const { owner, project } = await createProject()
    await contactService.create(project, owner, {
      email: 'a@example.com',
      customFields: { birthday: '1990-01-01' },
    })
    await contactService.create(project, owner, {
      email: 'b@example.com',
      customFields: { birthday: '2000-06-15' },
    })

    assert.deepEqual(
      await matchingEmails(
        project,
        {
          combinator: 'AND',
          conditions: [{ field: 'customFields.birthday', operator: 'before', value: '1995-01-01' }],
        },
        { birthday: 'date' }
      ),
      ['a@example.com']
    )

    assert.deepEqual(
      await matchingEmails(
        project,
        {
          combinator: 'AND',
          conditions: [{ field: 'customFields.birthday', operator: 'after', value: '1995-01-01' }],
        },
        { birthday: 'date' }
      ),
      ['b@example.com']
    )
  })

  test('tags: in / not_in', async ({ assert }) => {
    const { owner, project } = await createProject()
    const a = await contactService.create(project, owner, { email: 'a@example.com' })
    const b = await contactService.create(project, owner, { email: 'b@example.com' })
    await contactService.create(project, owner, { email: 'c@example.com' })

    const vip = await contactTagService.attach(project, a, owner, 'vip')
    await contactTagService.attach(project, b, owner, 'newsletter')

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'in', value: [vip.id] }],
      }),
      ['a@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'not_in', value: [vip.id] }],
      }),
      ['b@example.com', 'c@example.com']
    )
  })

  test('tags: is_null / is_not_null', async ({ assert }) => {
    const { owner, project } = await createProject()
    const a = await contactService.create(project, owner, { email: 'a@example.com' })
    await contactService.create(project, owner, { email: 'b@example.com' })
    await contactTagService.attach(project, a, owner, 'vip')

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'is_not_null' }],
      }),
      ['a@example.com']
    )

    assert.deepEqual(
      await matchingEmails(project, {
        combinator: 'AND',
        conditions: [{ field: 'tags', operator: 'is_null' }],
      }),
      ['b@example.com']
    )
  })

  test('greater_than on a non-number custom field is rejected defensively', async ({ assert }) => {
    const { project } = await createProject()
    const query = Contact.query().withScopes((scopes) => scopes.forProject(project))
    toQuery(
      {
        combinator: 'AND',
        conditions: [{ field: 'customFields.plan', operator: 'greater_than', value: 1 }],
      },
      query,
      { plan: 'text' }
    )

    await assert.rejects(() => query.exec())
  })
})
