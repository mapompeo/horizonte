import { describe, expect, it } from 'vitest'
import { buttonName, contentRect, sendableKey, toFraction, wheelSteps } from './input-capture'

describe('área da imagem e frações', () => {
  it('imagem mais larga que a janela: faixas pretas em cima e embaixo', () => {
    expect(contentRect({ width: 1366, height: 1024 }, { width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: (1024 - 768.375) / 2,
      width: 1366,
      height: 768.375
    })
  })

  it('imagem mais alta: faixas dos lados', () => {
    const rect = contentRect({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })
    expect(rect).toEqual({ x: 500, y: 0, width: 1000, height: 1000 })
  })

  it('sem o tamanho do vídeo ainda: o elemento inteiro', () => {
    expect(contentRect({ width: 800, height: 600 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600
    })
  })

  it('converte o ponto em fração da imagem e encosta na borda fora dela', () => {
    const rect = { x: 500, y: 0, width: 1000, height: 1000 }
    expect(toFraction({ x: 1000, y: 250 }, rect)).toEqual({ x: 0.5, y: 0.25 })
    expect(toFraction({ x: 100, y: 1200 }, rect)).toEqual({ x: 0, y: 1 })
  })
})

describe('rolagem em passos', () => {
  it('roda de mouse em pixels: 100 px são dois passos', () => {
    expect(wheelSteps(0, 100, 0)).toEqual({ steps: 2, rest: 0 })
  })

  it('touchpad: pedaços pequenos se juntam até dar um passo', () => {
    let rest = 0
    const sent: number[] = []
    for (const delta of [10, 15, 20, 10]) {
      const r = wheelSteps(rest, delta, 0)
      rest = r.rest
      if (r.steps) sent.push(r.steps)
    }
    expect(sent).toEqual([1])
    expect(rest).toBeCloseTo(0.1)
  })

  it('em linhas, três por passo; para cima é negativo', () => {
    expect(wheelSteps(0, -6, 1)).toEqual({ steps: -2, rest: 0 })
  })

  it('nunca manda mais de 20 passos de uma vez', () => {
    expect(wheelSteps(0, 100_000, 0).steps).toBe(20)
  })
})

describe('botões e teclas', () => {
  it('botões do mouse', () => {
    expect([0, 1, 2, 3, 4, 5].map(buttonName)).toEqual([
      'left',
      'middle',
      'right',
      'back',
      'forward',
      undefined
    ])
  })

  it('só as teclas que o protocolo conhece vão para a outra tela', () => {
    expect(sendableKey('KeyA')).toBe(true)
    expect(sendableKey('IntlRo')).toBe(true)
    expect(sendableKey('Fn')).toBe(false)
    expect(sendableKey('toString')).toBe(false)
  })
})
