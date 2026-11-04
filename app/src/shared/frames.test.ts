import { describe, expect, it } from 'vitest'
import type { RawCursor } from './cursor'
import { createFrameParser, framePool, type RawFrame } from './frames'

function encode(
  width: number,
  height: number,
  format = 0,
  fill = 7,
  stride = width * 4
): Uint8Array {
  const out = new Uint8Array(24 + stride * height)
  const view = new DataView(out.buffer)
  ;[0x31465a48, width, height, stride, format, stride * height].forEach((value, i) =>
    view.setUint32(i * 4, value, true)
  )
  out.fill(fill, 24)
  return out
}

function parse(chunks: Uint8Array[]): { frames: RawFrame[]; errors: string[] } {
  const frames: RawFrame[] = []
  const errors: string[] = []
  const push = createFrameParser(
    (f) => frames.push(f),
    (e) => errors.push(e)
  )
  for (const chunk of chunks) push(chunk)
  return { frames, errors }
}

describe('leitor de imagens da tela estendida', () => {
  it('lê uma imagem inteira', () => {
    const { frames } = parse([encode(4, 2)])
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ width: 4, height: 2, stride: 16, format: 'BGRX' })
    expect(frames[0].data.length).toBe(32)
    expect(frames[0].data.every((b) => b === 7)).toBe(true)
  })

  it('junta imagens que chegam em pedaços, inclusive com o cabeçalho partido', () => {
    const all = new Uint8Array([...encode(4, 2, 0, 1), ...encode(2, 2, 1, 2)])
    const chunks = [all.subarray(0, 5), all.subarray(5, 30), all.subarray(30, 61), all.subarray(61)]
    const { frames } = parse(chunks)
    expect(frames.map((f) => [f.width, f.format, f.data[0]])).toEqual([
      [4, 'BGRX', 1],
      [2, 'RGBX', 2]
    ])
  })

  it('aceita linhas com folga no fim', () => {
    const { frames } = parse([encode(3, 2, 0, 9, 16)])
    expect(frames[0]).toMatchObject({ width: 3, stride: 16 })
  })

  it('para no primeiro cabeçalho inválido', () => {
    const bad = encode(4, 2)
    bad[0] = 0
    const { frames, errors } = parse([bad, encode(4, 2)])
    expect(frames).toEqual([])
    expect(errors).toHaveLength(1)
  })

  it('recusa tamanho que não bate com as linhas', () => {
    const bad = encode(4, 2)
    new DataView(bad.buffer).setUint32(20, 999, true)
    expect(parse([bad]).errors).toHaveLength(1)
  })

  it('com as áreas reaproveitadas, a mesma área volta depois de três imagens', () => {
    const frames: RawFrame[] = []
    const push = createFrameParser(
      (f) => frames.push(f),
      () => undefined,
      framePool()
    )
    for (let i = 0; i < 4; i++) push(encode(4, 2, 0, i))
    expect(frames.map((f) => f.data[0])).toEqual([3, 1, 2, 3])
    expect(frames[3].data).toBe(frames[0].data)
    expect(frames[1].data).not.toBe(frames[0].data)
  })

  it('separa as mensagens do cursor das imagens, com o desenho só quando ele muda', () => {
    const cursorMessage = (x: number, y: number, shape?: Uint8Array, w = 2, h = 1): Uint8Array => {
      const out = new Uint8Array(32 + (shape?.length ?? 0))
      const view = new DataView(out.buffer)
      ;[0x31435a48, x, y, 1, 0, 1, w | (h << 16), shape?.length ?? 0].forEach((v, i) =>
        view.setUint32(i * 4, v >>> 0, true)
      )
      if (shape) out.set(shape, 32)
      return out
    }
    const frames: RawFrame[] = []
    const cursors: RawCursor[] = []
    const push = createFrameParser(
      (f) => frames.push(f),
      () => undefined,
      undefined,
      (c) => cursors.push(c)
    )
    // BGRA: azul, depois vermelho; o leitor entrega em RGBA.
    const bgra = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255])
    const all = new Uint8Array([
      ...cursorMessage(10, 20, bgra),
      ...encode(4, 2),
      ...cursorMessage(-5, 3)
    ])
    // Em pedaços de 5 bytes, para partir os cabeçalhos no meio.
    for (let i = 0; i < all.length; i += 5) push(all.subarray(i, i + 5))
    expect(frames).toHaveLength(1)
    expect(cursors).toHaveLength(2)
    expect(cursors[0]).toMatchObject({ x: 10, y: 20, visible: true })
    expect(cursors[0].shape).toMatchObject({ width: 2, height: 1, hotX: 1, hotY: 0 })
    expect([...(cursors[0].shape?.data ?? [])]).toEqual([0, 0, 255, 255, 255, 0, 0, 255])
    expect(cursors[1]).toEqual({ x: -5, y: 3, visible: true })
  })
})
