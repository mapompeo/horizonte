import { describe, expect, it } from 'vitest'
import { BITRATE_MAX, BITRATE_MIN, PROFILES, clampBitrate, profileFor, stepBitrate } from './quality'

describe('clampBitrate', () => {
  it('mantém valores válidos', () => {
    expect(clampBitrate(30)).toBe(30)
  })

  it('arredonda decimais', () => {
    expect(clampBitrate(5.4)).toBe(5)
    expect(clampBitrate(33.6)).toBe(34)
  })

  it('limita aos extremos', () => {
    expect(clampBitrate(0)).toBe(BITRATE_MIN)
    expect(clampBitrate(-10)).toBe(BITRATE_MIN)
    expect(clampBitrate(1000)).toBe(BITRATE_MAX)
    expect(clampBitrate(Infinity)).toBe(PROFILES.equilibrado)
  })

  it('usa o padrão para valores que não são número', () => {
    expect(clampBitrate(NaN)).toBe(PROFILES.equilibrado)
  })
})

describe('stepBitrate', () => {
  it('sobe e desce pelos passos', () => {
    expect(stepBitrate(30, 1)).toBe(40)
    expect(stepBitrate(30, -1)).toBe(20)
  })

  it('não passa dos extremos', () => {
    expect(stepBitrate(80, 1)).toBe(80)
    expect(stepBitrate(5, -1)).toBe(5)
  })

  it('a partir de um valor fora dos passos vai para o vizinho', () => {
    expect(stepBitrate(33, 1)).toBe(40)
    expect(stepBitrate(33, -1)).toBe(30)
  })

  it('valores absurdos entram na faixa antes do passo', () => {
    expect(stepBitrate(1000, -1)).toBe(60)
    expect(stepBitrate(-5, 1)).toBe(10)
    expect(stepBitrate(NaN, 1)).toBe(40)
  })
})

describe('profileFor', () => {
  it('reconhece os perfis', () => {
    expect(profileFor(10)).toBe('economico')
    expect(profileFor(30)).toBe('equilibrado')
    expect(profileFor(60)).toBe('maximo')
  })

  it('qualquer outro valor é personalizado', () => {
    expect(profileFor(31)).toBe('custom')
    expect(profileFor(NaN)).toBe('equilibrado')
  })
})
