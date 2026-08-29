import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'email_deliveries'

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
        .integer('campaign_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('campaigns')
        .onDelete('SET NULL')
      table
        .integer('campaign_execution_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('campaign_executions')
        .onDelete('SET NULL')
      table
        .integer('email_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('emails')
        .onDelete('SET NULL')
      table
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table
        .integer('smtp_connector_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('smtp_connectors')
        .onDelete('SET NULL')
      table.string('idempotency_key', 128).notNullable().unique()
      table.string('provider_message_id', 255).nullable()
      table
        .enum('status', [
          'pending',
          'queued',
          'processing',
          'sent',
          'delivered',
          'failed',
          'bounced',
        ])
        .notNullable()
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0)
      table.text('last_error').nullable()
      table.timestamp('sent_at').nullable()
      table.timestamp('delivered_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['project_id', 'status', 'created_at'], 'email_deliveries_project_status_idx')
      table.index(['contact_id'], 'email_deliveries_contact_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
