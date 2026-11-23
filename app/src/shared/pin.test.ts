import { describe, expect, it } from 'vitest'
import { isValidPin } from './pin'

describe('isValidPin', () => {
  it.each(['0000', '4821', '9999', '0042'])('aceita %s', (pin) => {
    expect(isValidPin(pin)).toBe(true)
  })

  it.each([
    '',
    '123',
    '12345',
    'abcd',
    '12 3',
    ' 123',
    '12\n3',
    '１２３４',
    1234,
    null,
    undefined,
    {}
  ])('rejeita %o', (pin) => {
    expect(isValidPin(pin)).toBe(false)
  })
})
