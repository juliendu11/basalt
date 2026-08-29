import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_enrollments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('project_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table
        .integer('campaign_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaigns')
        .onDelete('CASCADE')
      table
        .integer('campaign_version_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_versions')
        .onDelete('RESTRICT')
      table
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table.enum('status', ['active', 'completed', 'exited', 'cancelled']).notNullable()
      table.string('source', 64).notNullable()
      table.timestamp('enrolled_at').notNullable()
      table.timestamp('exited_at').nullable()
      table.string('exit_reason', 64).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      // Explicit short names: MySQL/MariaDB caps identifiers at 64 chars,
      // and the auto-generated name for this column combination exceeds it.
      table.unique(['campaign_id', 'contact_id', 'campaign_version_id'], {
        indexName: 'campaign_enrollments_campaign_contact_version_unique',
      })
      table.index(['project_id', 'campaign_id', 'status'], 'campaign_enrollments_project_idx')
      // Complementary to the above (docs/plans/13-campaign-enrollment.md §
      // Performance considerations) — serves the "does this contact already
      // have an active enrollment for this campaign" check independently of
      // project_id, which CampaignEnrollmentService.enroll() (Phase 11)
      // performs on an already-resolved campaign.
      table.index(['campaign_id', 'contact_id', 'status'], 'campaign_enrollments_campaign_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
