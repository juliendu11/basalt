import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'email_layouts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('text_content', 'longtext').nullable().after('html_content')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('text_content')
    })
  }
}
