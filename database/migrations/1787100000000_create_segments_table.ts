import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'segments'

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
      table.json('definition').notNullable()
      table.json('referenced_fields').notNullable()
      table.integer('contact_count_cache').unsigned().notNullable().defaultTo(0)
      table.timestamp('last_computed_at').nullable()
      table
        .enum('last_computation_status', ['idle', 'running', 'success', 'failed'])
        .notNullable()
        .defaultTo('idle')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
