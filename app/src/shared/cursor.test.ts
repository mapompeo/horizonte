import { describe, expect, it } from 'vitest'
import { decodePosition, decodeShape, encodePosition, encodeShape } from './cursor'

describe('cursor à parte', () => {
  it('posição vai e volta em fração da tela', () => {
    expect(decodePosition(encodePosition(0.25, 0.5, true))).toEqual({
      x: 0.25,
      y: 0.5,
      visible: true
    })
    expect(decodePosition(encodePosition(0, 0, false))?.visible).toBe(false)
    expect(decodePosition(new ArrayBuffer(8))).toBeNull()
  })

  it('desenho vai e volta, e um desenho fora do formato não passa', () => {
    const data = new Uint8Array(2 * 3 * 4).fill(9)
    const shape = decodeShape(encodeShape({ width: 2, height: 3, hotX: 1, hotY: 2, data }))
    expect(shape).toMatchObject({ width: 2, height: 3, hotX: 1, hotY: 2 })
    expect(shape?.data.length).toBe(24)
    // Tamanho que não bate com os pixels, ponto do clique fora do desenho e desenho grande demais.
    expect(decodeShape(new Uint8Array(8 + 4).buffer)).toBeNull()
    expect(decodeShape(encodeShape({ width: 2, height: 3, hotX: 2, hotY: 0, data }))).toBeNull()
    const huge = new Uint8Array(8)
    new DataView(huge.buffer).setUint16(0, 999, true)
    expect(decodeShape(huge.buffer)).toBeNull()
  })
})
