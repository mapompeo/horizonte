import { expect, it } from 'vitest'
import { CHANGELOG } from './changelog'

it('o que mudou: mais nova em cima, frases curtas com ponto e os três idiomas', () => {
  const dates = CHANGELOG.map((c) => c.date)
  expect([...dates].sort().reverse()).toEqual(dates)
  for (const change of CHANGELOG) {
    expect(change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(change.items.length).toBeGreaterThan(0)
    for (const item of change.items)
      for (const text of [item.pt, item.en, item.es]) {
        expect(text).toMatch(/^([A-ZÁÉÍÓÚ¿]|iP).*\.$/)
        expect(text.length).toBeLessThanOrEqual(100)
        expect(text).not.toMatch(/—/)
      }
  }
})
