import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'email_events'

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
        .integer('email_delivery_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('email_deliveries')
        .onDelete('CASCADE')
      table
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table
        .enum('type', [
          'sent',
          'delivered',
          'opened',
          'clicked',
          'bounced',
          'complained',
          'failed',
          'unsubscribed',
        ])
        .notNullable()
      table.json('metadata').nullable()
      table.timestamp('occurred_at').notNullable()

      table.index(['email_delivery_id', 'type'], 'email_events_delivery_type_idx')
      table.index(['project_id', 'type', 'occurred_at'], 'email_events_project_type_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
