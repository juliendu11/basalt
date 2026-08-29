import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaigns'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('reentry_policy', ['never', 'after_exit', 'always'])
        .notNullable()
        .defaultTo('never')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('reentry_policy')
    })
  }
}
