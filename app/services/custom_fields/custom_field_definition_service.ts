import type Project from '#models/project'
import CustomFieldDefinition, { type CustomFieldType } from '#models/custom_field_definition'

export interface CustomFieldDefinitionPayload {
  key: string
  label: string
  type: CustomFieldType
}

export default class CustomFieldDefinitionService {
  async create(
    project: Project,
    payload: CustomFieldDefinitionPayload
  ): Promise<CustomFieldDefinition> {
    return CustomFieldDefinition.create({
      projectId: project.id,
      key: payload.key,
      label: payload.label,
      type: payload.type,
    })
  }

  /** Only `label` is editable — see the model/migration for why key/type are immutable. */
  async update(definition: CustomFieldDefinition, label: string): Promise<CustomFieldDefinition> {
    definition.label = label
    await definition.save()
    return definition
  }

  async delete(definition: CustomFieldDefinition): Promise<void> {
    await definition.delete()
  }
}

/**
 * Project-scoped `key -> type` lookup, reused by the segment validator
 * (`app/validators/segment.ts`) and evaluator (`app/services/segments/segment_evaluator.ts`)
 * to resolve which operators a `customFields.*` condition may use. Exported
 * standalone (not a service method) since it's a plain read with no
 * side effects, called from contexts that only have a `projectId`.
 */
export async function loadCustomFieldTypes(
  projectId: number
): Promise<Record<string, CustomFieldType>> {
  const rows = await CustomFieldDefinition.query()
    .where('projectId', projectId)
    .select('key', 'type')
  return Object.fromEntries(rows.map((row) => [row.key, row.type]))
}
