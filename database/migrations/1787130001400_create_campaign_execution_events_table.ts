import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_execution_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('campaign_execution_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_executions')
        .onDelete('CASCADE')
      table
        .integer('node_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('campaign_nodes')
        .onDelete('SET NULL')
      table.string('type', 64).notNullable()
      table.text('message').nullable()
      table.json('metadata').nullable()
      table.timestamp('occurred_at').notNullable()

      table.index(['campaign_execution_id', 'occurred_at'], 'campaign_execution_events_exec_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
