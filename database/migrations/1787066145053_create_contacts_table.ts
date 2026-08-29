import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contacts'

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
      table.string('email', 254).notNullable()
      table.string('first_name').nullable()
      table.string('last_name').nullable()
      table.string('phone').nullable()
      table.string('company').nullable()
      table.string('country').nullable()
      table.string('city').nullable()
      table.string('language', 10).nullable()
      table.string('timezone').nullable()
      table
        .enum('status', ['subscribed', 'unsubscribed', 'bounced', 'complained', 'blocked'])
        .notNullable()
        .defaultTo('subscribed')
      table.json('custom_fields').nullable()
      table.timestamp('deleted_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['project_id', 'email'])
      table.index(['project_id', 'status'])
      table.index(['project_id', 'deleted_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
