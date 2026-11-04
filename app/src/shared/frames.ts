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
const HEADER = 24
/** Nenhuma tela de verdade passa disso (8K com folga): acima, o fluxo está corrompido. */
const MAX_FRAME = 8192 * 8192 * 4

/**
 * Junta os pedaços que chegam do socket e entrega imagens inteiras. Cabeçalho de 24 bytes (seis inteiros de 32 bits,
 * little-endian): "HZF1", largura, altura, bytes por linha, formato (0 = BGRX, 1 = RGBX) e tamanho; depois os dados.
 * Um cabeçalho inválido chama `onError` e para de entregar.
 */
export function createFrameParser(
  onFrame: (frame: RawFrame) => void,
  onError: (message: string) => void
): (chunk: Uint8Array) => void {
  let header: Uint8Array = new Uint8Array(HEADER)
  let headerFill = 0
  let pending: Omit<RawFrame, 'data'> | null = null
  let data: Uint8Array | null = null
  let dataFill = 0
  let broken = false

  return (chunk) => {
    let offset = 0
    while (!broken && offset < chunk.length) {
      if (!pending) {
        const take = Math.min(HEADER - headerFill, chunk.length - offset)
        header.set(chunk.subarray(offset, offset + take), headerFill)
        headerFill += take
        offset += take
        if (headerFill < HEADER) return
        const view = new DataView(header.buffer, header.byteOffset, HEADER)
        const [magic, width, height, stride, format, size] = [0, 4, 8, 12, 16, 20].map((at) =>
          view.getUint32(at, true)
        )
        headerFill = 0
        header = new Uint8Array(HEADER)
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
        data = new Uint8Array(size)
        dataFill = 0
      }
      const target = data as Uint8Array
      const take = Math.min(target.length - dataFill, chunk.length - offset)
      target.set(chunk.subarray(offset, offset + take), dataFill)
      dataFill += take
      offset += take
      if (dataFill === target.length) {
        const frame = { ...pending, data: target }
        pending = null
        data = null
        onFrame(frame)
      }
    }
  }
}
