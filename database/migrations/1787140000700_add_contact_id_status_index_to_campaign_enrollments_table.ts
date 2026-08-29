import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_enrollments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Complementary to the existing (project_id, campaign_id, status)
      // index — serves CampaignEnrollmentService.enroll()'s per-contact
      // lookups (docs/plans/13-campaign-enrollment.md § Performance
      // considerations). Explicit short name: the auto-generated one
      // exceeds MySQL's 64-char identifier limit on this table (see
      // mysql_identifier_length_limit memory).
      table.index(['campaign_id', 'contact_id', 'status'], 'campaign_enrollments_contact_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex([], 'campaign_enrollments_contact_idx')
    })
  }
}
