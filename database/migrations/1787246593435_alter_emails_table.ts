import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'emails'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('body_content', 'longtext').nullable().after('html_content')
      table.text('html_content', 'longtext').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('body_content')
      table.text('html_content', 'longtext').notNullable().alter()
    })
  }
}
