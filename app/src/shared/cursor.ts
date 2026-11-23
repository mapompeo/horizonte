/**
 * O cursor da tela estendida, à parte da imagem: quem envia manda a posição (canal `cursor`, sem reenvio: só a mais
 * recente importa) e, quando muda, o desenho (canal `cursor-shape`, confiável). Quem mostra desenha por cima do vídeo,
 * e o cursor anda com o atraso da rede em vez do de codificar e decodificar a imagem.
 */

export const CURSOR = 'cursor'
export const CURSOR_SHAPE = 'cursor-shape'
/** O maior desenho que o auxiliar manda. Acima de `SHAPE_MAX_BYTES` ele não cabe numa mensagem do canal e não vai. */
export const CURSOR_MAX = 384
export const SHAPE_MAX_BYTES = 256 * 1024 - 8

/** Como o auxiliar do Linux manda: posição em pixels da tela estendida, e o desenho só quando muda. */
export interface RawCursor {
  x: number
  y: number
  visible: boolean
  shape?: CursorShape
}

export interface CursorShape {
  width: number
  height: number
  /** O ponto do desenho que fica na posição do cursor. */
  hotX: number
  hotY: number
  /** RGBA, sem folga por linha. */
  data: Uint8Array
}

/** Posição em fração da tela (0 a 1) e se aparece: três números de 32 bits. */
export function encodePosition(x: number, y: number, visible: boolean): ArrayBuffer {
  return new Float32Array([x, y, visible ? 1 : 0]).buffer
}

export function decodePosition(
  raw: ArrayBuffer
): { x: number; y: number; visible: boolean } | null {
  if (raw.byteLength !== 12) return null
  const [x, y, visible] = new Float32Array(raw)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, visible: visible === 1 }
}

/** Largura, altura e ponto do clique (16 bits cada) e depois os pixels RGBA. */
export function encodeShape(shape: CursorShape): ArrayBuffer {
  const out = new Uint8Array(8 + shape.data.length)
  new DataView(out.buffer).setUint16(0, shape.width, true)
  new DataView(out.buffer).setUint16(2, shape.height, true)
  new DataView(out.buffer).setUint16(4, shape.hotX, true)
  new DataView(out.buffer).setUint16(6, shape.hotY, true)
  out.set(shape.data, 8)
  return out.buffer
}

export function decodeShape(raw: ArrayBuffer): CursorShape | null {
  if (raw.byteLength < 8) return null
  const view = new DataView(raw)
  const [width, height, hotX, hotY] = [0, 2, 4, 6].map((at) => view.getUint16(at, true))
  if (!width || !height || width > CURSOR_MAX || height > CURSOR_MAX) return null
  if (hotX >= width || hotY >= height) return null
  if (raw.byteLength !== 8 + width * height * 4) return null
  return { width, height, hotX, hotY, data: new Uint8Array(raw, 8) }
}

/** BGRA para RGBA, numa cópia (o auxiliar manda no formato que o GNOME usa). */
export function bgraToRgba(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i + 2]
    out[i + 1] = data[i + 1]
    out[i + 2] = data[i]
    out[i + 3] = data[i + 3]
  }
  return out
}
