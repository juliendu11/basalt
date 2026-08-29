import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'unsubscribe_tokens'

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
        .integer('contact_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contacts')
        .onDelete('CASCADE')
      table.string('token', 64).notNullable().unique()

      table.timestamp('created_at').notNullable()
      table.timestamp('used_at').nullable()

      table.index(['contact_id'], 'unsubscribe_tokens_contact_idx')
      // Complementary to the generic schema doc (docs/plans/17-unsubscribe.md
      // § Idempotency considerations): guarantees `getOrCreate` can never
      // race into two live tokens for the same (project, contact) — a
      // contact has exactly one stable unsubscribe URL for a given project,
      // reused across every email sent, never one-per-send.
      table.unique(['project_id', 'contact_id'], 'unsubscribe_tokens_project_contact_unique')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
