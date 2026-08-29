import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_versions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('campaign_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaigns')
        .onDelete('CASCADE')
      table.integer('version_number').unsigned().notNullable()
      table.enum('status', ['draft', 'published', 'archived']).notNullable()
      table.smallint('graph_format_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('published_at').nullable()
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['campaign_id', 'version_number'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
