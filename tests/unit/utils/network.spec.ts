import { test } from '@japa/runner'
import { isPrivateAddress, assertPublicHost } from '#utils/network'

test.group('isPrivateAddress', () => {
  test('flags loopback, private, link-local, CGNAT and reserved IPv4', ({ assert }) => {
    for (const ip of [
      '127.0.0.1',
      '0.0.0.0',
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      assert.isTrue(isPrivateAddress(ip), `${ip} should be private`)
    }
  })

  test('allows public IPv4', ({ assert }) => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34']) {
      assert.isFalse(isPrivateAddress(ip), `${ip} should be public`)
    }
  })

  test('flags loopback, link-local, unique-local and IPv4-mapped IPv6', ({ assert }) => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      assert.isTrue(isPrivateAddress(ip), `${ip} should be private`)
    }
  })

  test('allows public IPv6', ({ assert }) => {
    assert.isFalse(isPrivateAddress('2606:4700:4700::1111'))
  })

  test('treats a non-IP literal as unsafe', ({ assert }) => {
    assert.isTrue(isPrivateAddress('not-an-ip'))
    assert.isTrue(isPrivateAddress(''))
  })
})

test.group('assertPublicHost', () => {
  test('rejects an IP literal in a private range', async ({ assert }) => {
    await assert.rejects(() => assertPublicHost('169.254.169.254'))
    await assert.rejects(() => assertPublicHost('127.0.0.1'))
  })

  test('returns the vetted address for a public IP literal', async ({ assert }) => {
    const addresses = await assertPublicHost('1.1.1.1')
    assert.deepEqual(addresses, ['1.1.1.1'])
  })

  test('rejects a hostname that resolves to loopback', async ({ assert }) => {
    // localhost resolves to 127.0.0.1 / ::1 — both private.
    await assert.rejects(() => assertPublicHost('localhost'))
  })
})
