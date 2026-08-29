import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'campaigns'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign('draft_version_id')
        .references('id')
        .inTable('campaign_versions')
        .onDelete('SET NULL')
      table
        .foreign('published_version_id')
        .references('id')
        .inTable('campaign_versions')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('draft_version_id')
      table.dropForeign('published_version_id')
    })
  }
}
