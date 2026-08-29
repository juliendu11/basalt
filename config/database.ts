import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import type { ConnectionOptions } from 'mysql2'
import env from '#start/env'

/**
 * mysql2 returns `TINYINT(1)` columns (how Knex/Lucid migrations create
 * `table.boolean(...)`) as JS numbers (0/1), not booleans, unless told
 * otherwise — the model's `declare isDefault: boolean` type is then a lie
 * for any row read back from the database (as opposed to one just created
 * in-memory, which still holds the JS value it was constructed with). Cast
 * at the driver level so every boolean column, current and future,
 * round-trips as an actual `boolean` (docs/plans/07-smtp-connectors.md —
 * first boolean columns in the schema, `smtp_connectors.is_default`/`enabled`).
 *
 * Lucid's own connection config type narrows `typeCast` to `boolean`
 * (it doesn't model mysql2's function form), so this is built against
 * mysql2's real `ConnectionOptions` type and bridged with a single cast
 * where it's handed to `defineConfig` below, rather than losing type safety
 * on every field in the connection block.
 */
const mysqlConnection: ConnectionOptions = {
  host: env.get('DB_HOST'),
  port: env.get('DB_PORT'),
  user: env.get('DB_USER'),
  password: env.get('DB_PASSWORD'),
  database: env.get('DB_DATABASE'),
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1'
    }
    return next()
  },
}

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: 'mysql',

  connections: {
    mysql: {
      client: 'mysql2',
      connection: mysqlConnection as unknown as { host: string },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      schemaGeneration: {
        rulesPaths: ['#database/schema_rules'],
      },
      debug: app.inDev,
    },
  },
})

export default dbConfig
