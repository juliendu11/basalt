import { test } from '@japa/runner'
import DeliveryTokenService from '#services/tracking/delivery_token_service'

const service = new DeliveryTokenService()

test.group('DeliveryTokenService', () => {
  test('round-trips encode -> decode', ({ assert }) => {
    const token = service.encode(42)
    assert.equal(service.decode(token), 42)
  })

  test('a tampered token (one flipped character in the signature) is rejected', ({ assert }) => {
    const token = service.encode(42)
    const [idPart, signature] = token.split('.')
    const flipped = signature[0] === 'a' ? 'b' : 'a'
    const tampered = `${idPart}.${flipped}${signature.slice(1)}`

    assert.isNull(service.decode(tampered))
  })

  test('a tampered id part is rejected (signature no longer matches)', ({ assert }) => {
    const tokenForOtherId = service.encode(43)
    const token = service.encode(42)
    const [, signature] = token.split('.')
    const [otherIdPart] = tokenForOtherId.split('.')

    assert.isNull(service.decode(`${otherIdPart}.${signature}`))
  })

  test('a malformed token is rejected', ({ assert }) => {
    assert.isNull(service.decode('not-a-valid-token'))
    assert.isNull(service.decode(''))
    assert.isNull(service.decode('a.b.c'))
  })
})
