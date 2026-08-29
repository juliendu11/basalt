/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Which process this container/instance should run (see
  | docker/entrypoint.sh) — the HTTP server, a BullMQ queue
  | worker, or the periodic scheduler loop
  | (docs/plans/14-jobs-and-queues.md).
  |----------------------------------------------------------
  */
  PROCESS_TYPE: Env.schema.enum.optional(['web', 'queue', 'scheduler'] as const),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_HOST: Env.schema.string(),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['redis', 'memory'] as const),

  REDIS_HOST: Env.schema.string({ format: 'host' }),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.secret.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the BullMQ queue concurrency
  | (docs/plans/14-jobs-and-queues.md)
  |----------------------------------------------------------
  */
  QUEUE_EMAILS_CONCURRENCY: Env.schema.number.optional(),
  QUEUE_CAMPAIGN_ENGINE_CONCURRENCY: Env.schema.number.optional(),
  QUEUE_SEGMENTS_CONCURRENCY: Env.schema.number.optional(),
  QUEUE_TRACKING_CONCURRENCY: Env.schema.number.optional(),
  QUEUE_STATISTICS_CONCURRENCY: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the mail package
  |----------------------------------------------------------
  */
  MAIL_MAILER: Env.schema.enum(['smtp'] as const),
  MAIL_FROM_NAME: Env.schema.string(),
  MAIL_FROM_ADDRESS: Env.schema.string(),
  SMTP_HOST: Env.schema.string(),
  SMTP_PORT: Env.schema.number(),

  /*
  |----------------------------------------------------------
  | Google Cloud Translation API key, used to clone an email
  | into another language (app/services/emails/email_service.ts
  | #translate). Optional — the feature just errors until set.
  |----------------------------------------------------------
  */
  GOOGLE_TRANSLATE_API_KEY: Env.schema.secret.optional(),
})
