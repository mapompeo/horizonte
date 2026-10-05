import { describe, expect, it } from 'vitest'
import { isHostAddress } from './address'

describe('isHostAddress', () => {
  it.each(['192.168.1.5', 'desktop.local', 'fe80::1', 'meu-pc'])('aceita %s', (value) => {
    expect(isHostAddress(value)).toBe(true)
  })

  it.each(['', ' ', '192.168.1.5 --fullscreen', '--arg', 'a b', 'a;b', 'a\nb', 5, null, undefined])(
    'recusa %j (nunca vira argumento de linha de comando)',
    (value) => {
      expect(isHostAddress(value)).toBe(false)
    }
  )

  it('recusa o que passa de 255 caracteres', () => {
    expect(isHostAddress('a'.repeat(256))).toBe(false)
  })
})
