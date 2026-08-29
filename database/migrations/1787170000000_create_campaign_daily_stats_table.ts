import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaign_daily_stats'

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
      table
        .integer('campaign_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('campaigns')
        .onDelete('CASCADE')
      table.date('date').notNullable()
      table.integer('sent').unsigned().notNullable().defaultTo(0)
      table.integer('delivered').unsigned().notNullable().defaultTo(0)
      table.integer('opened').unsigned().notNullable().defaultTo(0)
      table.integer('clicked').unsigned().notNullable().defaultTo(0)
      table.integer('bounced').unsigned().notNullable().defaultTo(0)
      table.integer('failed').unsigned().notNullable().defaultTo(0)
      table.integer('unsubscribed').unsigned().notNullable().defaultTo(0)

      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.unique(['campaign_id', 'date'], {
        indexName: 'campaign_daily_stats_campaign_date_unique',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
