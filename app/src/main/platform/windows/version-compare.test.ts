import { describe, expect, it } from 'vitest'
import { isOlder } from './version-compare'

describe('isOlder', () => {
  it('compara número a número, não texto', () => {
    expect(isOlder('2026.9.1', '2026.914.233613')).toBe(true)
    expect(isOlder('2026.1000.1', '2026.914.233613')).toBe(false)
  })
  it('igual, mais nova, vazia ou ilegível não atualiza', () => {
    expect(isOlder('2026.914.233613', '2026.914.233613')).toBe(false)
    expect(isOlder('2027.1.1', '2026.914.233613')).toBe(false)
    expect(isOlder('', '2026.914.233613')).toBe(false)
    expect(isOlder('abc', '2026.914.233613')).toBe(false)
  })
})
