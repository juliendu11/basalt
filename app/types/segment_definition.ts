/**
 * Recursive filter-tree shape stored in `segments.definition`
 * (docs/plans/06-segments.md § Domain concepts). A node is either a leaf
 * condition or a branch combining nested nodes with AND/OR — shared between
 * the validator, `SegmentEvaluator`, and the generated `Segment` model column
 * type (see `database/schema_rules.ts`).
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

/** The root of a segment's `definition` column is always a group. */
export type SegmentDefinition = SegmentConditionGroup

export function isConditionGroup(node: SegmentNode): node is SegmentConditionGroup {
  return 'combinator' in node
}
