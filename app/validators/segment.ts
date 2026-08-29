import vine from '@vinejs/vine'
import type { SegmentNode, SegmentOperator } from '#types/segment_definition'
import type { CustomFieldType } from '#models/custom_field_definition'
import { loadCustomFieldTypes } from '#services/custom_fields/custom_field_definition_service'

const CUSTOM_FIELD_PATTERN = /^customFields\.[a-zA-Z0-9_]+$/
const CUSTOM_FIELD_PREFIX = 'customFields.'

type FieldKind = 'text' | 'enum' | 'date' | 'number' | 'boolean' | 'tags'

/**
 * Standard `Contact` fields a segment definition may filter on
 * (docs/plans/05-contacts.md), mapped to the operator set their type
 * permits below. `customFields.*` is matched via `CUSTOM_FIELD_PATTERN`
 * instead of being listed here — its kind is resolved dynamically from the
 * project's `CustomFieldDefinition` rows (see `fieldKind` below).
 */
const STANDARD_FIELD_KINDS: Record<string, FieldKind> = {
  email: 'text',
  firstName: 'text',
  lastName: 'text',
  phone: 'text',
  company: 'text',
  country: 'text',
  city: 'text',
  language: 'text',
  timezone: 'text',
  status: 'enum',
  createdAt: 'date',
  updatedAt: 'date',
  tags: 'tags',
}

/** Maps a declared custom field type to the `FieldKind` operator set it gets in segments. */
function kindForCustomFieldType(type: CustomFieldType): FieldKind {
  switch (type) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'text':
      return 'text'
  }
}

/**
 * Operator compatibility per field type (docs/plans/06-segments.md §
 * Validation) — e.g. `greater_than`/`before`/`after` are rejected on text
 * fields, `contains`/`starts_with`/`ends_with` are rejected on dates. A
 * `customFields.*` field with no matching `CustomFieldDefinition` (an
 * undefined/legacy key) falls back to `text`, same as before typed custom
 * fields existed.
 */
const OPERATORS_BY_KIND: Record<FieldKind, Set<SegmentOperator>> = {
  text: new Set([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_null',
    'is_not_null',
    'in',
    'not_in',
  ]),
  enum: new Set(['equals', 'not_equals', 'in', 'not_in', 'is_null', 'is_not_null']),
  date: new Set(['equals', 'not_equals', 'before', 'after', 'is_null', 'is_not_null']),
  number: new Set([
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'is_null',
    'is_not_null',
    'in',
    'not_in',
  ]),
  boolean: new Set(['equals', 'not_equals', 'is_null', 'is_not_null']),
  tags: new Set(['in', 'not_in', 'is_null', 'is_not_null']),
}

/** Protects the evaluator from pathological trees (docs/plans/06-segments.md § Validation). */
const MAX_DEPTH = 5
const MAX_CONDITIONS = 50

class SegmentDefinitionError extends Error {}

function fieldKind(field: string, customFieldTypes: Record<string, CustomFieldType>): FieldKind {
  if (CUSTOM_FIELD_PATTERN.test(field)) {
    const type = customFieldTypes[field.slice(CUSTOM_FIELD_PREFIX.length)]
    return type ? kindForCustomFieldType(type) : 'text'
  }

  const kind = STANDARD_FIELD_KINDS[field]
  if (!kind) throw new SegmentDefinitionError(`Unknown field "${field}"`)
  return kind
}

/**
 * Recursively walks a candidate `definition` tree, throwing
 * `SegmentDefinitionError` on the first structural or semantic problem
 * found (unknown combinator, unknown field, operator/type mismatch, missing
 * value, depth/condition-count limits). `leafCounter` is shared across the
 * whole walk so the total-condition-count limit applies tree-wide, not
 * per-branch.
 */
function validateNode(
  node: unknown,
  depth: number,
  leafCounter: { count: number },
  customFieldTypes: Record<string, CustomFieldType>
): void {
  if (depth > MAX_DEPTH) {
    throw new SegmentDefinitionError(`Definition exceeds the maximum nesting depth of ${MAX_DEPTH}`)
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw new SegmentDefinitionError('Each node must be an object')
  }

  if ('combinator' in node) {
    const group = node as { combinator: unknown; conditions: unknown }

    if (group.combinator !== 'AND' && group.combinator !== 'OR') {
      throw new SegmentDefinitionError('combinator must be "AND" or "OR"')
    }
    if (!Array.isArray(group.conditions)) {
      throw new SegmentDefinitionError('conditions must be an array')
    }

    for (const child of group.conditions) {
      validateNode(child, depth + 1, leafCounter, customFieldTypes)
    }
    return
  }

  leafCounter.count += 1
  if (leafCounter.count > MAX_CONDITIONS) {
    throw new SegmentDefinitionError(
      `Definition exceeds the maximum of ${MAX_CONDITIONS} conditions`
    )
  }

  const leaf = node as { field: unknown; operator: unknown; value?: unknown }

  if (typeof leaf.field !== 'string' || leaf.field.length === 0) {
    throw new SegmentDefinitionError('field is required')
  }

  const kind = fieldKind(leaf.field, customFieldTypes)

  if (
    typeof leaf.operator !== 'string' ||
    !OPERATORS_BY_KIND[kind].has(leaf.operator as SegmentOperator)
  ) {
    throw new SegmentDefinitionError(
      `Operator "${String(leaf.operator)}" is not valid for field "${leaf.field}"`
    )
  }
  const operator = leaf.operator as SegmentOperator

  if (operator === 'is_null' || operator === 'is_not_null') {
    return
  }

  if (operator === 'in' || operator === 'not_in') {
    if (!Array.isArray(leaf.value) || leaf.value.length === 0) {
      throw new SegmentDefinitionError(`Operator "${operator}" requires a non-empty array value`)
    }
    for (const entry of leaf.value) {
      if (typeof entry !== 'string' && typeof entry !== 'number') {
        throw new SegmentDefinitionError(`Operator "${operator}" values must be strings or numbers`)
      }
    }
    return
  }

  if (leaf.value === undefined || leaf.value === null) {
    throw new SegmentDefinitionError(`A value is required for operator "${operator}"`)
  }
  if (!['string', 'number', 'boolean'].includes(typeof leaf.value)) {
    throw new SegmentDefinitionError(
      `The value for field "${leaf.field}" must be a string, number, or boolean`
    )
  }
}

/** Exported so `SegmentService` can walk an already-validated tree without re-throwing on valid input. */
export function assertValidSegmentDefinition(
  definition: unknown,
  customFieldTypes: Record<string, CustomFieldType> = {}
): asserts definition is SegmentNode {
  validateNode(definition, 1, { count: 0 }, customFieldTypes)
}

/**
 * Async because it resolves the project's `CustomFieldDefinition` types
 * (via `field.meta.projectId`, same pattern as `isUniqueEmailInProject` in
 * app/validators/contact.ts) before walking the tree — a `customFields.*`
 * leaf's valid operator set depends on the field's declared type. Falls
 * back to no known custom fields (everything is `text`) when the caller
 * doesn't pass a `projectId` in `meta`.
 */
const isValidSegmentDefinition = vine.createRule(async (value, _options, field) => {
  const projectId = field.meta.projectId as number | undefined
  const customFieldTypes = projectId ? await loadCustomFieldTypes(projectId) : {}

  try {
    assertValidSegmentDefinition(value, customFieldTypes)
  } catch (error) {
    const message =
      error instanceof SegmentDefinitionError ? error.message : 'Invalid segment definition'
    field.report(message, 'segmentDefinition', field)
  }
})

export const createSegmentValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  description: vine.string().trim().maxLength(500).optional(),
  definition: vine.any().use(isValidSegmentDefinition()),
})

export const updateSegmentValidator = createSegmentValidator

/** Used by the preview endpoint (no `name`/`segmentId` involved, definition-only). */
export const previewSegmentValidator = vine.create({
  definition: vine.any().use(isValidSegmentDefinition()),
})
