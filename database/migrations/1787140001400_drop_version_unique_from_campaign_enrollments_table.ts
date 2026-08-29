import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_enrollments'

  /**
   * `UNIQUE (campaign_id, contact_id, campaign_version_id)` (Phase 10) was
   * meant to guarantee "a re-entry on a different version is a distinct
   * row" (decisions/ADR-004-campaign-versioning.md § Risks) — but it also
   * incorrectly blocks a LEGITIMATE re-entry on the SAME still-published
   * version, which `reentry_policy: 'after_exit'`/`'always'`
   * (docs/plans/13-campaign-enrollment.md) explicitly exist to allow: a
   * contact can exit and re-enter a campaign multiple times without the
   * campaign ever being republished in between, and each attempt is a
   * distinct historical row. ADR-004's own text assumed `never`/`after_exit`
   * already prevented any second row from being attempted at all, which
   * is true only for a second *active* enrollment (already guarded by
   * `CampaignEnrollmentService.enroll()` step 3, an application-level
   * check, not this constraint) — it doesn't hold once a prior enrollment
   * has gone terminal and a policy explicitly permits trying again.
   *
   * "At most one active enrollment per (campaign, contact)" is,
   * consistent with the same limitation already accepted for
   * `smtp_connectors.is_default` (docs/plans/07-smtp-connectors.md — MySQL
   * has no partial/filtered unique index), enforced at the application
   * level only, not by a DB constraint.
   */
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        ['campaign_id', 'contact_id', 'campaign_version_id'],
        'campaign_enrollments_campaign_contact_version_unique'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['campaign_id', 'contact_id', 'campaign_version_id'], {
        indexName: 'campaign_enrollments_campaign_contact_version_unique',
      })
    })
  }
}
