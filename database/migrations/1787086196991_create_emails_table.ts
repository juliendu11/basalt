import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'emails'

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
        .integer('email_template_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('email_templates')
        .onDelete('SET NULL')
      table.string('name').notNullable()
      table.string('subject').notNullable()
      table.string('preheader').nullable()
      table.string('sender_name').notNullable()
      table.string('sender_email').notNullable()
      table.string('reply_to').nullable()
      table.text('html_content', 'longtext').notNullable()
      table.text('text_content', 'longtext').nullable()
      table.enum('status', ['draft', 'published']).notNullable().defaultTo('draft')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
