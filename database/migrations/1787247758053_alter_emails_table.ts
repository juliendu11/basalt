import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'emails'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('email_layout_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('email_layouts')
        .onDelete('SET NULL')
        .after('email_template_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('email_layout_id')
    })
  }
}
