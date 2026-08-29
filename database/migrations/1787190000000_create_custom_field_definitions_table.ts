import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'custom_field_definitions'

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
      table.string('key', 64).notNullable()
      table.string('label', 120).notNullable()
      table.enum('type', ['text', 'number', 'boolean', 'date']).notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['project_id', 'key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
