import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, targets } from '@adonisjs/core/logger'
import path from 'node:path'

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * Configure where logs are written.
       * Pretty logs in development, stdout in production.
       */
      transport: {
        targets: targets()
          .push(targets.pretty({ levelFirst: true, colorize: !app.inProduction }))
          .pushIf(!app.inTest, {
            target: 'pino-roll',
            level: 'debug',
            options: {
              file: app.inTest ? null : path.resolve(import.meta.dirname, '../logs/log'),
              frequency: 'daily',
              mkdir: true,
              dateFormat: 'yyyy-MM-dd',
            },
          })
          .pushIf(!app.inTest, {
            target: 'pino-roll',
            level: 'error',
            options: {
              file: app.inTest ? null : path.resolve(import.meta.dirname, '../logs/error'),
              frequency: 'daily',
              mkdir: true,
              dateFormat: 'yyyy-MM-dd',
            },
          })
          .toArray(),
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
