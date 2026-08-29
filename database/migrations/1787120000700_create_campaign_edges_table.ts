import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_edges'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('campaign_version_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_versions')
        .onDelete('CASCADE')
      table
        .integer('source_node_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_nodes')
        .onDelete('CASCADE')
      table
        .integer('target_node_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaign_nodes')
        .onDelete('CASCADE')
      table.string('source_handle', 32).nullable()

      table.timestamp('created_at').notNullable()

      table.index(['campaign_version_id', 'source_node_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
