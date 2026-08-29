import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contact_unsubscribe_events'

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
      table
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table
        .integer('campaign_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('campaigns')
        .onDelete('SET NULL')
      table.enum('source', ['link', 'manual', 'bounce', 'complaint', 'api']).notNullable()
      table.string('reason', 255).nullable()
      table.timestamp('occurred_at').notNullable()

      table.index(['contact_id'], 'contact_unsubscribe_events_contact_idx')
      table.index(['project_id'], 'contact_unsubscribe_events_project_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
