import type Contact from '#models/contact'
import db from '@adonisjs/lucid/services/db'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { CustomFieldType } from '#models/custom_field_definition'
import {
  isConditionGroup,
  type SegmentCondition,
  type SegmentDefinition,
  type SegmentNode,
} from '#types/segment_definition'

export type ContactQuery = ModelQueryBuilderContract<typeof Contact, Contact>

const CUSTOM_FIELD_PREFIX = 'customFields.'
const TAGS_FIELD = 'tags'
/**
 * The validator (app/validators/segment.ts) already restricts `field` on
 * incoming payloads to this same shape before a definition is ever saved,
 * but the evaluator re-checks it defensively — it's a pure function that
 * may be called directly (e.g. from tests, or a future caller), so it must
 * never trust its input to have already been validated
 * (docs/plans/06-segments.md § Security considerations).
 */
const CUSTOM_FIELD_KEY_PATTERN = /^[a-zA-Z0-9_]+$/

/**
 * Translates a segment's `definition` filter tree into constraints on a
 * Lucid `Contact` query builder — never by concatenating SQL strings, only
 * via the query builder's parameterized methods, including for
 * `customFields.*` paths (docs/plans/06-segments.md § Domain concepts,
 * § Security considerations).
 *
 * The entire tree is wrapped in a single nested `.where(...)` callback so
 * that a root-level `OR` can never leak out and combine with unrelated
 * constraints already present on `baseQuery` (e.g. the project scope) —
 * without this, a segment definition using OR at its root would silently
 * widen the query past the caller's own `.where('projectId', ...)`.
 *
 * `customFieldTypes` (project-scoped `key -> type`, from
 * `loadCustomFieldTypes` in `#services/custom_fields/custom_field_definition_service`)
 * drives which operators a `customFields.*` leaf may use below — defaults
 * to `{}` (every custom field treated as untyped text) for callers that
 * don't have a project handy, same behavior as before typed custom fields
 * existed.
 */
export function toQuery(
  definition: SegmentDefinition,
  baseQuery: ContactQuery,
  customFieldTypes: Record<string, CustomFieldType> = {}
): ContactQuery {
  if (definition.conditions.length === 0) {
    // Explicit per plan: no conditions matches every contact already
    // selected by the caller's own scoping (e.g. forProject).
    return baseQuery
  }

  baseQuery.where((builder) => {
    applyGroup(builder as unknown as ContactQuery, definition, customFieldTypes)
  })

  return baseQuery
}

function applyGroup(
  query: ContactQuery,
  group: { combinator: 'AND' | 'OR'; conditions: SegmentNode[] },
  customFieldTypes: Record<string, CustomFieldType>
): void {
  for (const node of group.conditions) {
    addNode(query, node, group.combinator, customFieldTypes)
  }
}

function addNode(
  query: ContactQuery,
  node: SegmentNode,
  combinator: 'AND' | 'OR',
  customFieldTypes: Record<string, CustomFieldType>
): void {
  const method = combinator === 'AND' ? 'where' : 'orWhere'

  if (isConditionGroup(node)) {
    query[method]((builder) =>
      applyGroup(builder as unknown as ContactQuery, node, customFieldTypes)
    )
    return
  }

  query[method]((builder) => applyLeaf(builder as unknown as ContactQuery, node, customFieldTypes))
}

/**
 * Every leaf is applied inside its own isolated `.where(cb)`/`.orWhere(cb)`
 * callback (added by `addNode` above), so inside this function there is
 * never anything else to combine with — always use the plain (non-`or`)
 * builder methods here.
 */
function applyLeaf(
  query: ContactQuery,
  condition: SegmentCondition,
  customFieldTypes: Record<string, CustomFieldType>
): void {
  if (condition.field.startsWith(CUSTOM_FIELD_PREFIX)) {
    applyCustomFieldLeaf(query, condition, customFieldTypes)
    return
  }

  if (condition.field === TAGS_FIELD) {
    applyTagsLeaf(query, condition)
    return
  }

  const column = condition.field
  const { operator, value } = condition

  switch (operator) {
    case 'equals':
      query.where(column, value as string | number | boolean)
      break
    case 'not_equals':
      query.whereNot(column, value as string | number | boolean)
      break
    case 'contains':
      query.where(column, 'like', `%${escapeLikeValue(String(value))}%`)
      break
    case 'not_contains':
      query.whereNot(column, 'like', `%${escapeLikeValue(String(value))}%`)
      break
    case 'starts_with':
      query.where(column, 'like', `${escapeLikeValue(String(value))}%`)
      break
    case 'ends_with':
      query.where(column, 'like', `%${escapeLikeValue(String(value))}`)
      break
    case 'greater_than':
      query.where(column, '>', value as string | number)
      break
    case 'less_than':
      query.where(column, '<', value as string | number)
      break
    case 'before':
      query.where(column, '<', value as string)
      break
    case 'after':
      query.where(column, '>', value as string)
      break
    case 'is_null':
      query.whereNull(column)
      break
    case 'is_not_null':
      query.whereNotNull(column)
      break
    case 'in':
      query.whereIn(column, value as (string | number)[])
      break
    case 'not_in':
      query.whereNotIn(column, value as (string | number)[])
      break
    default:
      operator satisfies never
  }
}

/**
 * `customFields.*` conditions are translated to a `JSON_UNQUOTE(JSON_EXTRACT(...))`
 * comparison — the SQL template is entirely fixed/hand-written (never built
 * from user input), the JSON path is built from a key already constrained
 * to `[a-zA-Z0-9_]+` (re-validated above, not just trusted from the
 * validator), and every value is passed as a bound parameter, never
 * interpolated into the query text.
 */
function applyCustomFieldLeaf(
  query: ContactQuery,
  condition: SegmentCondition,
  customFieldTypes: Record<string, CustomFieldType>
): void {
  const key = condition.field.slice(CUSTOM_FIELD_PREFIX.length)
  if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid custom field key in segment condition: "${key}"`)
  }

  const type = customFieldTypes[key] ?? 'text'
  const path = `$.${key}`
  const extract = 'JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ?))'
  const { operator, value } = condition

  switch (operator) {
    case 'equals':
      query.whereRaw(`${extract} = ?`, [path, String(value)])
      break
    case 'not_equals':
      query.whereRaw(`(${extract} != ? OR ${extract} IS NULL)`, [path, String(value), path])
      break
    case 'contains':
      query.whereRaw(`${extract} LIKE ?`, [path, `%${escapeLikeValue(String(value))}%`])
      break
    case 'not_contains':
      query.whereRaw(`(${extract} NOT LIKE ? OR ${extract} IS NULL)`, [
        path,
        `%${escapeLikeValue(String(value))}%`,
        path,
      ])
      break
    case 'starts_with':
      query.whereRaw(`${extract} LIKE ?`, [path, `${escapeLikeValue(String(value))}%`])
      break
    case 'ends_with':
      query.whereRaw(`${extract} LIKE ?`, [path, `%${escapeLikeValue(String(value))}`])
      break
    case 'is_null':
      query.whereRaw(`${extract} IS NULL`, [path])
      break
    case 'is_not_null':
      query.whereRaw(`${extract} IS NOT NULL`, [path])
      break
    case 'in': {
      const values = (value as (string | number)[]).map(String)
      query.whereRaw(`${extract} IN (${values.map(() => '?').join(',')})`, [path, ...values])
      break
    }
    case 'not_in': {
      const values = (value as (string | number)[]).map(String)
      query.whereRaw(
        `(${extract} NOT IN (${values.map(() => '?').join(',')}) OR ${extract} IS NULL)`,
        [path, ...values, path]
      )
      break
    }
    case 'greater_than':
    case 'less_than': {
      // Only reachable when the validator resolved this field's kind to
      // `number` (a `CustomFieldDefinition` with type `'number'`) — mirrored
      // here defensively since this function re-validates its own input.
      if (type !== 'number') {
        throw new Error(`Operator "${operator}" is not supported on a non-number custom field`)
      }
      const cast = `CAST(${extract} AS DECIMAL(20,6))`
      query.whereRaw(`${cast} ${operator === 'greater_than' ? '>' : '<'} ?`, [path, Number(value)])
      break
    }
    case 'before':
    case 'after': {
      // Only reachable when the field's kind is `date`. No CAST needed: the
      // custom field is stored as an ISO 8601 date/datetime string, which
      // sorts correctly under plain string comparison — same as the
      // `equals` case above.
      if (type !== 'date') {
        throw new Error(`Operator "${operator}" is not supported on a non-date custom field`)
      }
      query.whereRaw(`${extract} ${operator === 'before' ? '<' : '>'} ?`, [path, String(value)])
      break
    }
    default:
      operator satisfies never
  }
}

/**
 * `tags` conditions are translated against the `contact_tags` pivot rather
 * than a `Contact` column — `value` is a list of tag IDs (never tag names,
 * which aren't stable/unique enough to filter on). `in`/`not_in` reuse the
 * existing operators as "has any of"/"has none of these tags";
 * `is_null`/`is_not_null` mean "has no tags at all"/"has at least one tag"
 * (mirroring how those operators already read as "empty"/"not empty" on
 * every other field).
 */
function applyTagsLeaf(query: ContactQuery, condition: SegmentCondition): void {
  const { operator, value } = condition

  const contactIdsWithAnyTag = () => db.from('contact_tags').select('contact_id')
  const contactIdsWithTags = (tagIds: (string | number)[]) =>
    contactIdsWithAnyTag().whereIn('tag_id', tagIds)

  switch (operator) {
    case 'in':
      query.whereIn('id', contactIdsWithTags(value as (string | number)[]))
      break
    case 'not_in':
      query.whereNotIn('id', contactIdsWithTags(value as (string | number)[]))
      break
    case 'is_null':
      query.whereNotIn('id', contactIdsWithAnyTag())
      break
    case 'is_not_null':
      query.whereIn('id', contactIdsWithAnyTag())
      break
    default:
      throw new Error(`Operator "${operator}" is not supported on the "tags" field`)
  }
}

/** Escapes MySQL's default `LIKE` wildcards/escape char in a user-supplied value. */
function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
