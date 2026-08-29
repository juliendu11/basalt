import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ScheduledTaskRegistryClass from '#services/jobs/scheduled_task_registry'

/**
 * The service exports a singleton, but each test needs a clean registry —
 * we import the class fresh isn't possible for a singleton export, so we
 * rely on unique task names per test instead of resetting shared state.
 */

test.group('ScheduledTaskRegistry', () => {
  test('interval task is due immediately, then again only after the interval elapses', ({
    assert,
  }) => {
    const registry = ScheduledTaskRegistryClass
    registry.register('test.interval', { type: 'interval', everySeconds: 60 }, async () => {})
    const task = registry.list().find((t) => t.name === 'test.interval')!

    const t0 = DateTime.utc(2026, 1, 1, 10, 0, 0)
    assert.isTrue(registry.isDue(task, t0))

    registry.markRan(task, t0)
    assert.isFalse(registry.isDue(task, t0.plus({ seconds: 30 })))
    assert.isTrue(registry.isDue(task, t0.plus({ seconds: 60 })))
  })

  test('daily task runs once per UTC day at or after the configured time', ({ assert }) => {
    const registry = ScheduledTaskRegistryClass
    registry.register('test.daily', { type: 'daily', atUtc: '03:00' }, async () => {})
    const task = registry.list().find((t) => t.name === 'test.daily')!

    const beforeTime = DateTime.utc(2026, 1, 1, 2, 59)
    assert.isFalse(registry.isDue(task, beforeTime))

    const atTime = DateTime.utc(2026, 1, 1, 3, 0)
    assert.isTrue(registry.isDue(task, atTime))

    registry.markRan(task, atTime)
    // Same day, later — must not run twice.
    assert.isFalse(registry.isDue(task, DateTime.utc(2026, 1, 1, 15, 0)))
    // Next day, at/after the configured time — due again.
    assert.isTrue(registry.isDue(task, DateTime.utc(2026, 1, 2, 3, 0)))
  })

  test('hourly task runs once per UTC hour at or after the configured minute', ({ assert }) => {
    const registry = ScheduledTaskRegistryClass
    registry.register('test.hourly', { type: 'hourly', atMinute: 15 }, async () => {})
    const task = registry.list().find((t) => t.name === 'test.hourly')!

    assert.isFalse(registry.isDue(task, DateTime.utc(2026, 1, 1, 10, 10)))
    assert.isTrue(registry.isDue(task, DateTime.utc(2026, 1, 1, 10, 15)))

    registry.markRan(task, DateTime.utc(2026, 1, 1, 10, 20))
    assert.isFalse(registry.isDue(task, DateTime.utc(2026, 1, 1, 10, 45)))
    assert.isTrue(registry.isDue(task, DateTime.utc(2026, 1, 1, 11, 15)))
  })
})
