import { test } from '@japa/runner'
import jobHandlerRegistry from '#services/jobs/job_handler_registry'

test.group('JobHandlerRegistry', () => {
  test('resolves a registered handler', async ({ assert }) => {
    let called = false
    jobHandlerRegistry.register('tracking', 'test.unit.resolve', async () => {
      called = true
    })

    const handler = jobHandlerRegistry.resolve('tracking', 'test.unit.resolve')
    await handler({}, {} as any)

    assert.isTrue(called)
  })

  test('throws when resolving an unregistered job', ({ assert }) => {
    assert.throws(
      () => jobHandlerRegistry.resolve('tracking', 'test.unit.does_not_exist'),
      /No job handler registered/
    )
  })

  test('throws when registering the same queue/job twice', ({ assert }) => {
    jobHandlerRegistry.register('tracking', 'test.unit.duplicate', async () => {})

    assert.throws(
      () => jobHandlerRegistry.register('tracking', 'test.unit.duplicate', async () => {}),
      /already registered/
    )
  })
})
