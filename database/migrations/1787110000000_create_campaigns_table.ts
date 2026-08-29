import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaigns'

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
      table.string('name').notNullable()
      table.string('description').nullable()
      table
        .enum('status', ['draft', 'active', 'paused', 'completed', 'archived'])
        .notNullable()
        .defaultTo('draft')
      // No FK yet: `campaign_versions` doesn't exist until the next
      // migration in this same phase — the circular relationship
      // (campaigns <-> campaign_versions) is resolved by adding these two
      // columns in a follow-up migration, same pattern already used for
      // `audit_logs.project_id` (docs/plans/04-projects.md).
      table.integer('draft_version_id').unsigned().nullable()
      table.integer('published_version_id').unsigned().nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
