import { describe, expect, it } from 'vitest'
import { parameterSetsFirst } from './h264'

/** Uma unidade NAL com código de início de 4 bytes e o tipo no primeiro byte. */
const nal = (type: number, ...payload: number[]): number[] => [0, 0, 0, 1, 0x60 | type, ...payload]
const types = (data: Uint8Array): number[] => {
  const out: number[] = []
  for (let i = 0; i + 4 < data.length; i++)
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1)
      out.push(data[i + 4] & 0x1f)
  return out
}

describe('parameterSetsFirst', () => {
  it('põe SPS e PPS antes da imagem', () => {
    const frame = new Uint8Array([...nal(5, 9, 9, 9), ...nal(7, 1, 2), ...nal(8, 3)])
    const fixed = parameterSetsFirst(frame)
    expect(fixed && types(fixed)).toEqual([7, 8, 5])
    expect(fixed?.length).toBe(frame.length)
    expect(Array.from(fixed ?? [])).toEqual([...nal(7, 1, 2), ...nal(8, 3), ...nal(5, 9, 9, 9)])
  })

  it('mantém a ordem de cada grupo (SEI e fatias depois dos parâmetros)', () => {
    const frame = new Uint8Array([...nal(6, 4), ...nal(5, 1), ...nal(5, 2), ...nal(7), ...nal(8)])
    expect(types(parameterSetsFirst(frame) as Uint8Array)).toEqual([7, 8, 6, 5, 5])
  })

  it('não mexe no que já está em ordem', () => {
    expect(parameterSetsFirst(new Uint8Array([...nal(7), ...nal(8), ...nal(5, 1)]))).toBeNull()
  })

  it('não mexe em quadro sem parâmetros', () => {
    expect(parameterSetsFirst(new Uint8Array([...nal(1, 1), ...nal(1, 2)]))).toBeNull()
  })

  it('não mexe no que não é Annex B', () => {
    expect(parameterSetsFirst(new Uint8Array([0x9d, 0x01, 0x2a, 0, 0, 1, 0x65]))).toBeNull()
  })

  it('aceita código de início de 3 bytes', () => {
    const frame = new Uint8Array([0, 0, 1, 0x65, 7, 0, 0, 1, 0x67, 8])
    expect(Array.from(parameterSetsFirst(frame) ?? [])).toEqual([
      0, 0, 1, 0x67, 8, 0, 0, 1, 0x65, 7
    ])
  })
})
