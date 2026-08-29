import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_executions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('campaign_enrollment_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_enrollments')
        .onDelete('CASCADE')
      table
        .integer('current_node_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('campaign_nodes')
        .onDelete('SET NULL')
      table
        .enum('status', ['pending', 'running', 'waiting', 'completed', 'failed', 'cancelled'])
        .notNullable()
      table.timestamp('scheduled_at').notNullable()
      table.timestamp('started_at').nullable()
      table.timestamp('finished_at').nullable()
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0)
      table.text('last_error').nullable()
      table.timestamp('locked_at').nullable()
      table.string('locked_by', 64).nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['campaign_enrollment_id'])
      table.index(['status', 'scheduled_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
