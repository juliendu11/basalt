import { randomBytes } from 'node:crypto'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'smtp_connectors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('webhook_secret', 64).nullable()
    })

    // Backfill existing connectors with a unique secret, then lock the column.
    this.defer(async (db) => {
      const rows = await db.from(this.tableName).select('id')
      for (const row of rows) {
        await db
          .from(this.tableName)
          .where('id', row.id)
          .update({ webhook_secret: randomBytes(32).toString('base64url') })
      }
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.string('webhook_secret', 64).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('webhook_secret')
    })
  }
}
