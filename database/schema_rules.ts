import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

export default {
  columns: {
    /**
     * `role` columns are always the same organization role enum across the
     * schema (organization_memberships, organization_invitations) — narrow
     * the generated type from `string` to the literal union so models don't
     * have to redeclare it themselves.
     */
    role: {
      tsType: "'owner' | 'admin' | 'member' | 'viewer'",
      imports: [],
      decorators: [{ name: '@column' }],
    },
    /**
     * Every `metadata` JSON column in the schema is a free-form bag of
     * event-specific details (docs/plans/20-observability-and-audit.md) —
     * narrower than the default `any`, without pretending to a concrete
     * shape that varies per event.
     */
    metadata: {
      tsType: 'Record<string, unknown>',
      imports: [],
      decorators: [{ name: '@column' }],
    },
    /**
     * `projects.settings` is a free-form, non-structuring JSON bag in v1
     * (docs/plans/04-projects.md) — same rationale as `metadata` above.
     */
    settings: {
      tsType: 'Record<string, unknown>',
      imports: [],
      decorators: [{ name: '@column' }],
    },
  },
  tables: {
    /**
     * Scoped to `contacts` (rather than the global `columns` rules above) so
     * a later domain's own `status` enum on a different table isn't forced
     * into this one (docs/plans/05-contacts.md § Domain concepts).
     */
    contacts: {
      columns: {
        status: {
          tsType: "'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'blocked'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
        custom_fields: {
          tsType: 'Record<string, string | number | boolean | null>',
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `smtp_connectors` (docs/plans/07-smtp-connectors.md § Domain
     * concepts) — `encryption`/`last_test_status` enums are specific to this
     * table.
     */
    smtp_connectors: {
      columns: {
        encryption: {
          tsType: "'none' | 'ssl' | 'tls'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
        last_test_status: {
          tsType: "'unknown' | 'success' | 'failed'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `emails` (docs/plans/09-emails.md § Domain concepts) — this
     * `status` is purely informational for the UI (draft/published), unlike
     * `contacts.status`, so it gets its own table-scoped rule rather than
     * being folded into the global `status` shape.
     */
    emails: {
      columns: {
        status: {
          tsType: "'draft' | 'published'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `segments` (docs/plans/06-segments.md § Data model). The
     * recursive filter-tree shape of `definition` is shared with the
     * validator and `SegmentEvaluator` via `#types/segment_definition` rather
     * than redeclared inline like the simpler enum rules above.
     */
    segments: {
      columns: {
        definition: {
          tsType: 'SegmentDefinition',
          imports: [{ source: '#types/segment_definition', typeImports: ['SegmentDefinition'] }],
          decorators: [{ name: '@column' }],
        },
        referenced_fields: {
          tsType: 'string[]',
          imports: [],
          decorators: [{ name: '@column' }],
        },
        last_computation_status: {
          tsType: "'idle' | 'running' | 'success' | 'failed'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaigns` (docs/plans/10-campaigns.md § Domain concepts).
     */
    campaigns: {
      columns: {
        status: {
          tsType: "'draft' | 'active' | 'paused' | 'completed' | 'archived'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
        reentry_policy: {
          tsType: "'never' | 'after_exit' | 'always'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaign_versions` (decisions/ADR-004-campaign-versioning.md).
     */
    campaign_versions: {
      columns: {
        status: {
          tsType: "'draft' | 'published' | 'archived'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaign_nodes` (docs/plans/11-campaign-builder.md § Domain
     * concepts, decisions/ADR-001-campaign-graph-storage.md). `config` varies
     * entirely by `subtype` (validated in application via
     * `app/validators/campaign_node.ts`, never at the SQL layer) — typed the
     * same free-form way as `metadata`/`settings` above rather than a fake
     * concrete shape.
     */
    campaign_nodes: {
      columns: {
        type: {
          tsType: "'source' | 'action' | 'condition' | 'trigger'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
        config: {
          tsType: 'Record<string, unknown>',
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaign_enrollments` (docs/plans/13-campaign-enrollment.md,
     * docs/plans/02-database-design.md § Campagnes — exécution).
     */
    campaign_enrollments: {
      columns: {
        status: {
          tsType: "'active' | 'completed' | 'exited' | 'cancelled'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaign_executions` (docs/plans/12-campaign-engine.md §
     * Data model).
     */
    campaign_executions: {
      columns: {
        status: {
          tsType: "'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `campaign_execution_events` (docs/plans/12-campaign-engine.md
     * § Data model) — `metadata` is a free-form bag of transition-specific
     * details, same rationale as the global `metadata` rule above but kept
     * table-scoped for consistency with every other JSON column in this file.
     */
    campaign_execution_events: {
      columns: {
        metadata: {
          tsType: 'Record<string, unknown>',
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `email_deliveries` (docs/plans/decisions/ADR-005-email-idempotency.md,
     * docs/plans/15-retry-and-idempotency.md).
     */
    email_deliveries: {
      columns: {
        status: {
          tsType:
            "'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `email_events` (docs/plans/16-email-tracking.md § Data
     * model) — `type` is the fixed event vocabulary, `metadata` is a
     * free-form bag (user-agent, clicked URL, provider bounce code).
     */
    email_events: {
      columns: {
        type: {
          tsType:
            "'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'unsubscribed'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
        metadata: {
          tsType: 'Record<string, unknown>',
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `contact_unsubscribe_events` (docs/plans/17-unsubscribe.md §
     * Data model) — `source` is this table's own fixed vocabulary, distinct
     * from `email_events.type`'s broader event set above.
     */
    contact_unsubscribe_events: {
      columns: {
        source: {
          tsType: "'link' | 'manual' | 'bounce' | 'complaint' | 'api'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
    /**
     * Scoped to `custom_field_definitions` — the value-type vocabulary a
     * project-scoped contact custom field can declare, shared with the
     * segment builder's typed-operator support (`app/validators/segment.ts`,
     * `app/services/segments/segment_evaluator.ts`).
     */
    custom_field_definitions: {
      columns: {
        type: {
          tsType: "'text' | 'number' | 'boolean' | 'date'",
          imports: [],
          decorators: [{ name: '@column' }],
        },
      },
    },
  },
} satisfies SchemaRules
