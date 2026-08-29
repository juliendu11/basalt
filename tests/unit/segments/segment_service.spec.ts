import { test } from '@japa/runner'
import { extractReferencedFields } from '#services/segments/segment_service'
import type { SegmentDefinition } from '#types/segment_definition'

test.group('extractReferencedFields', () => {
  test('collects the field of a single leaf', ({ assert }) => {
    const definition: SegmentDefinition = {
      combinator: 'AND',
      conditions: [{ field: 'country', operator: 'equals', value: 'France' }],
    }

    assert.deepEqual(extractReferencedFields(definition), ['country'])
  })

  test('dedupes a field referenced multiple times across nested groups', ({ assert }) => {
    const definition: SegmentDefinition = {
      combinator: 'AND',
      conditions: [
        { field: 'country', operator: 'equals', value: 'France' },
        {
          combinator: 'OR',
          conditions: [
            { field: 'country', operator: 'equals', value: 'Spain' },
            { field: 'status', operator: 'equals', value: 'subscribed' },
          ],
        },
      ],
    }

    assert.sameMembers(extractReferencedFields(definition), ['country', 'status'])
    assert.lengthOf(extractReferencedFields(definition), 2)
  })

  test('returns an empty array for an empty definition', ({ assert }) => {
    assert.deepEqual(extractReferencedFields({ combinator: 'AND', conditions: [] }), [])
  })

  test('includes customFields.* keys as-is', ({ assert }) => {
    const definition: SegmentDefinition = {
      combinator: 'AND',
      conditions: [{ field: 'customFields.plan', operator: 'equals', value: 'pro' }],
    }

    assert.deepEqual(extractReferencedFields(definition), ['customFields.plan'])
  })
})
