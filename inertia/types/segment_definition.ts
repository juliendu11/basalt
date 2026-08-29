/**
 * Frontend mirror of `app/types/segment_definition.ts` — kept as a separate
 * copy (not imported across the server/client boundary, `#types/*` subpath
 * imports aren't resolvable from `inertia/`) since the two builds are
 * intentionally independent.
 */
export type SegmentOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'before'
  | 'after'
  | 'is_null'
  | 'is_not_null'
  | 'in'
  | 'not_in'

export interface SegmentCondition {
  field: string
  operator: SegmentOperator
  value?: string | number | boolean | (string | number)[] | null
}

export interface SegmentConditionGroup {
  combinator: 'AND' | 'OR'
  conditions: SegmentNode[]
}

export type SegmentNode = SegmentCondition | SegmentConditionGroup

export function isConditionGroup(node: SegmentNode): node is SegmentConditionGroup {
  return 'combinator' in node
}

export type FieldKind = 'text' | 'enum' | 'date' | 'number' | 'boolean' | 'tags'

export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date'

export interface CustomFieldDefinitionOption {
  key: string
  label: string
  type: CustomFieldType
}

export interface TagOption {
  id: number
  name: string
}

export const STANDARD_FIELDS: { field: string; label: string; kind: FieldKind }[] = [
  { field: 'email', label: 'Email', kind: 'text' },
  { field: 'firstName', label: 'First name', kind: 'text' },
  { field: 'lastName', label: 'Last name', kind: 'text' },
  { field: 'phone', label: 'Phone', kind: 'text' },
  { field: 'company', label: 'Company', kind: 'text' },
  { field: 'country', label: 'Country', kind: 'text' },
  { field: 'city', label: 'City', kind: 'text' },
  { field: 'language', label: 'Language', kind: 'text' },
  { field: 'timezone', label: 'Timezone', kind: 'text' },
  { field: 'status', label: 'Status', kind: 'enum' },
  { field: 'createdAt', label: 'Created at', kind: 'date' },
  { field: 'updatedAt', label: 'Updated at', kind: 'date' },
  { field: 'tags', label: 'Tags', kind: 'tags' },
]

/** Maps a declared custom field type to the `FieldKind` operator set it gets in segments (mirrors `kindForCustomFieldType` in `app/validators/segment.ts`). */
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

export const OPERATORS_BY_KIND: Record<FieldKind, { operator: SegmentOperator; label: string }[]> =
  {
    text: [
      { operator: 'equals', label: 'is' },
      { operator: 'not_equals', label: 'is not' },
      { operator: 'contains', label: 'contains' },
      { operator: 'not_contains', label: 'does not contain' },
      { operator: 'starts_with', label: 'starts with' },
      { operator: 'ends_with', label: 'ends with' },
      { operator: 'is_null', label: 'is empty' },
      { operator: 'is_not_null', label: 'is not empty' },
      { operator: 'in', label: 'is one of' },
      { operator: 'not_in', label: 'is not one of' },
    ],
    enum: [
      { operator: 'equals', label: 'is' },
      { operator: 'not_equals', label: 'is not' },
      { operator: 'in', label: 'is one of' },
      { operator: 'not_in', label: 'is not one of' },
      { operator: 'is_null', label: 'is empty' },
      { operator: 'is_not_null', label: 'is not empty' },
    ],
    date: [
      { operator: 'equals', label: 'is' },
      { operator: 'not_equals', label: 'is not' },
      { operator: 'before', label: 'is before' },
      { operator: 'after', label: 'is after' },
      { operator: 'is_null', label: 'is empty' },
      { operator: 'is_not_null', label: 'is not empty' },
    ],
    number: [
      { operator: 'equals', label: 'is' },
      { operator: 'not_equals', label: 'is not' },
      { operator: 'greater_than', label: 'is greater than' },
      { operator: 'less_than', label: 'is less than' },
      { operator: 'is_null', label: 'is empty' },
      { operator: 'is_not_null', label: 'is not empty' },
      { operator: 'in', label: 'is one of' },
      { operator: 'not_in', label: 'is not one of' },
    ],
    boolean: [
      { operator: 'equals', label: 'is' },
      { operator: 'not_equals', label: 'is not' },
      { operator: 'is_null', label: 'is empty' },
      { operator: 'is_not_null', label: 'is not empty' },
    ],
    tags: [
      { operator: 'in', label: 'has any of' },
      { operator: 'not_in', label: 'has none of' },
      { operator: 'is_null', label: 'has no tags' },
      { operator: 'is_not_null', label: 'has any tags' },
    ],
  }

/**
 * `customFieldDefinitions` (optional) resolves a `customFields.*` field's
 * kind from the project's declared custom field types, mirroring the
 * backend's `fieldKind` in `app/validators/segment.ts`. Omitted (e.g. the
 * campaign builder's `contact_field_config.vue`, which doesn't have this
 * project-scoped list wired up) falls back to `'text'`, same as before
 * typed custom fields existed.
 */
export function fieldKind(
  field: string,
  customFieldDefinitions: CustomFieldDefinitionOption[] = []
): FieldKind {
  if (field.startsWith('customFields.')) {
    const key = field.slice('customFields.'.length)
    const definition = customFieldDefinitions.find((d) => d.key === key)
    return definition ? kindForCustomFieldType(definition.type) : 'text'
  }
  return STANDARD_FIELDS.find((f) => f.field === field)?.kind ?? 'text'
}

export function operatorNeedsValue(operator: SegmentOperator): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null'
}

export function operatorNeedsListValue(operator: SegmentOperator): boolean {
  return operator === 'in' || operator === 'not_in'
}

export const CONTACT_STATUSES = ['subscribed', 'unsubscribed', 'bounced', 'complained', 'blocked']
