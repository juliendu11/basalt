import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'segment_contacts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('segment_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('segments')
        .onDelete('CASCADE')
      table
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table.timestamp('added_at').notNullable()

      table.unique(['segment_id', 'contact_id'])
      table.index(['contact_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
