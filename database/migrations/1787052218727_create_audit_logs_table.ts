import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('organization_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE')
      // No FK yet: the `projects` table doesn't exist until
      // docs/plans/04-projects.md — the constraint is added there.
      table.integer('project_id').unsigned().nullable()
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('action', 100).notNullable()
      table.string('entity_type', 100).nullable()
      table.integer('entity_id').unsigned().nullable()
      table.json('metadata').nullable()
      table.timestamp('occurred_at').notNullable()

      table.index(['organization_id', 'occurred_at'])
      table.index(['project_id', 'occurred_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
