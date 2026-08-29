import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_nodes'

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
      table.string('client_key', 64).notNullable()
      table.enum('type', ['source', 'action', 'condition', 'trigger']).notNullable()
      table.string('subtype', 64).notNullable()
      table.json('config').notNullable()
      table.integer('position_x').notNullable()
      table.integer('position_y').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['campaign_version_id', 'client_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
