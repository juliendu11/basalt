import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'smtp_connectors'

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
      table.string('host').notNullable()
      table.integer('port').unsigned().notNullable()
      table.string('username').notNullable()
      table.text('password_encrypted').notNullable()
      table.enum('encryption', ['none', 'ssl', 'tls']).notNullable()
      table.string('from_email').notNullable()
      table.string('from_name').notNullable()
      table.string('reply_to').nullable()
      table.boolean('is_default').notNullable().defaultTo(false)
      table.boolean('enabled').notNullable().defaultTo(true)
      table.integer('daily_limit').unsigned().nullable()
      table.timestamp('last_tested_at').nullable()
      table
        .enum('last_test_status', ['unknown', 'success', 'failed'])
        .notNullable()
        .defaultTo('unknown')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['project_id', 'name'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
