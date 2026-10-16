import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'segment_contacts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('excluded_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('excluded_at')
    })
  }
}
