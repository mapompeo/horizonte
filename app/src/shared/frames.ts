import { bgraToRgba, CURSOR_MAX, type RawCursor } from './cursor'

/** Uma imagem da tela estendida, como o `horizonte-display` (Linux) manda pelo socket. */
export interface RawFrame {
  width: number
  height: number
  /** Bytes por linha (pode ser maior que largura × 4). */
  stride: number
  format: 'BGRX' | 'RGBX'
  data: Uint8Array
}

const MAGIC = 0x31465a48 // "HZF1"
const CURSOR_MAGIC = 0x31435a48 // "HZC1"
const HEADER = 24
/** O cursor tem 8 bytes a mais de cabeçalho (ver `horizonte-display.c`, send_cursor). */
const CURSOR_HEADER = 32
/** Nenhuma tela de verdade passa disso (8K com folga): acima, o fluxo está corrompido. */
const MAX_FRAME = 8192 * 8192 * 4

/**
 * Três áreas de 8 MB reaproveitadas, uma atrás da outra: uma sendo preenchida, a mais recente esperando a vez e uma de
 * folga. Criar uma nova a cada imagem (60 por segundo) deixava o coletor de lixo com ~500 MB por segundo; medido com
 * 1920×1080 a 60 quadros, o processo que envia caiu de ~200% para ~120% de CPU e passou a entregar todos os quadros.
 * Quem recebe a imagem precisa copiar os dados antes de a terceira seguinte chegar (o `VideoFrame` copia na hora).
 */
export function framePool(slots = 3): (size: number) => Uint8Array {
  let buffers: Uint8Array[] = []
  let next = 0
  return (size) => {
    if (buffers[0]?.length !== size) {
      buffers = Array.from({ length: slots }, () => new Uint8Array(size))
      next = 0
    }
    const buffer = buffers[next]
    next = (next + 1) % slots
    return buffer
  }
}

/**
 * Junta os pedaços que chegam do socket e entrega imagens inteiras. Cabeçalho de 24 bytes (seis inteiros de 32 bits,
 * little-endian): "HZF1", largura, altura, bytes por linha, formato (0 = BGRX, 1 = RGBX) e tamanho; depois os dados.
 * Com o cursor à parte, chegam também mensagens "HZC1" (32 bytes: posição, ponto do clique, opções, tamanho do desenho
 * e bytes do desenho; depois o desenho), entregues em `onCursor`. Um cabeçalho inválido chama `onError` e para.
 */
export function createFrameParser(
  onFrame: (frame: RawFrame) => void,
  onError: (message: string) => void,
  /** De onde vem a área de cada imagem; sem ela, uma nova por imagem. */
  alloc: (size: number) => Uint8Array = (size) => new Uint8Array(size),
  onCursor: (cursor: RawCursor) => void = () => undefined
): (chunk: Uint8Array) => void {
  let header: Uint8Array = new Uint8Array(CURSOR_HEADER)
  let headerFill = 0
  let pending: Omit<RawFrame, 'data'> | null = null
  /** Mensagem do cursor esperando o desenho. */
  let cursor: {
    base: RawCursor
    w: number
    h: number
    hx: number
    hy: number
    rgba: boolean
  } | null = null
  let data: Uint8Array | null = null
  let dataFill = 0
  let broken = false

  return (chunk) => {
    let offset = 0
    while (!broken && offset < chunk.length) {
      if (!pending && !cursor) {
        // Os 4 primeiros bytes dizem o tipo e, com ele, o tamanho do cabeçalho.
        const kind =
          headerFill >= 4 ? new DataView(header.buffer, header.byteOffset, 4).getUint32(0, true) : 0
        const need = headerFill < 4 ? 4 : kind === CURSOR_MAGIC ? CURSOR_HEADER : HEADER
        const take = Math.min(need - headerFill, chunk.length - offset)
        header.set(chunk.subarray(offset, offset + take), headerFill)
        headerFill += take
        offset += take
        if (headerFill < need || need === 4) continue
        const view = new DataView(header.buffer, header.byteOffset, need)
        if (need === CURSOR_HEADER) {
          const [x, y, hx, hy] = [4, 8, 12, 16].map((at) => view.getInt32(at, true))
          const flags = view.getUint32(20, true)
          const dims = view.getUint32(24, true)
          const size = view.getUint32(28, true)
          const w = dims & 0xffff
          const h = dims >>> 16
          headerFill = 0
          header = new Uint8Array(CURSOR_HEADER)
          const badShape =
            w === 0 || h === 0 || w > CURSOR_MAX || h > CURSOR_MAX || size !== w * h * 4
          if (size !== 0 && badShape) {
            broken = true
            onError('cursor da tela estendida em formato inesperado')
            return
          }
          const base = { x, y, visible: (flags & 1) === 1 }
          if (size === 0) onCursor(base)
          else {
            cursor = { base, w, h, hx, hy, rgba: (flags & 2) === 2 }
            data = new Uint8Array(size)
            dataFill = 0
          }
          continue
        }
        const [magic, width, height, stride, format, size] = [0, 4, 8, 12, 16, 20].map((at) =>
          view.getUint32(at, true)
        )
        headerFill = 0
        header = new Uint8Array(CURSOR_HEADER)
        if (
          magic !== MAGIC ||
          width === 0 ||
          height === 0 ||
          stride < width * 4 ||
          format > 1 ||
          size !== stride * height ||
          size > MAX_FRAME
        ) {
          broken = true
          onError('imagem da tela estendida em formato inesperado')
          return
        }
        pending = { width, height, stride, format: format === 0 ? 'BGRX' : 'RGBX' }
        data = alloc(size)
        dataFill = 0
      }
      const target = data as Uint8Array
      const take = Math.min(target.length - dataFill, chunk.length - offset)
      target.set(chunk.subarray(offset, offset + take), dataFill)
      dataFill += take
      offset += take
      if (dataFill !== target.length) continue
      if (cursor) {
        const { base, w, h, hx, hy, rgba } = cursor
        cursor = null
        data = null
        const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max - 1)
        onCursor({
          ...base,
          shape: {
            width: w,
            height: h,
            hotX: clamp(hx, w),
            hotY: clamp(hy, h),
            data: rgba ? target : bgraToRgba(target)
          }
        })
      } else if (pending) {
        const frame = { ...pending, data: target }
        pending = null
        data = null
        onFrame(frame)
      }
    }
  }
}
