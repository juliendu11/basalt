import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_daily_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.date('date').notNullable()
      table.integer('contacts_total').unsigned().notNullable().defaultTo(0)
      table.integer('contacts_active').unsigned().notNullable().defaultTo(0)
      table.integer('emails_sent').unsigned().notNullable().defaultTo(0)
      table.integer('emails_delivered').unsigned().notNullable().defaultTo(0)
      table.integer('emails_opened').unsigned().notNullable().defaultTo(0)
      table.integer('emails_clicked').unsigned().notNullable().defaultTo(0)
      table.integer('emails_bounced').unsigned().notNullable().defaultTo(0)
      table.integer('emails_failed').unsigned().notNullable().defaultTo(0)
      table.integer('unsubscribes').unsigned().notNullable().defaultTo(0)

      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.unique(['project_id', 'date'], { indexName: 'project_daily_stats_project_date_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
