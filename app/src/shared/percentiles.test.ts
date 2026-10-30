import { describe, expect, it } from 'vitest'
import { percentiles } from './percentiles'

describe('percentiles', () => {
  it('mediana e p95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentiles(values)).toEqual({ median: 51, p95: 96 })
  })

  it('série vazia', () => {
    expect(percentiles([])).toBeNull()
  })
})
