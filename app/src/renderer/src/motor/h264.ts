const SPS = 7
const PPS = 8

/** Onde começa cada unidade NAL de um quadro H.264 em Annex B (o começo do código de início, de 3 ou 4 bytes). */
function nalStarts(data: Uint8Array): number[] {
  const starts: number[] = []
  for (let i = 0; i + 3 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue
    if (data[i + 2] === 1) {
      starts.push(i)
      i += 2
    } else if (data[i + 2] === 0 && data[i + 3] === 1) {
      starts.push(i)
      i += 3
    }
  }
  return starts
}

const nalType = (data: Uint8Array, start: number): number =>
  data[start + (data[start + 2] === 1 ? 3 : 4)] & 0x1f

/**
 * Alguns codificadores por placa de vídeo (a VA-API da Mesa numa Radeon RX 580, por exemplo) entregam o quadro-chave
 * com a imagem antes dos parâmetros (SPS e PPS). Quem recebe descarta a imagem por não conhecer os parâmetros, pede
 * outro quadro-chave e recebe o mesmo defeito: o vídeo nunca começa. Aqui os parâmetros vão para a frente.
 *
 * Devolve null quando o quadro já está em ordem (ou não é Annex B), para não copiar à toa.
 */
export function parameterSetsFirst(data: Uint8Array): Uint8Array | null {
  const starts = nalStarts(data)
  if (starts.length < 2 || starts[0] !== 0) return null
  const units = starts.map((start, i) => ({
    type: nalType(data, start),
    bytes: data.subarray(start, i + 1 < starts.length ? starts[i + 1] : data.length)
  }))
  const isParam = (type: number): boolean => type === SPS || type === PPS
  const firstOther = units.findIndex((u) => !isParam(u.type))
  const lastParam = units.findLastIndex((u) => isParam(u.type))
  if (lastParam === -1 || firstOther === -1 || lastParam < firstOther) return null

  const out = new Uint8Array(data.length)
  let offset = 0
  for (const unit of [
    ...units.filter((u) => isParam(u.type)),
    ...units.filter((u) => !isParam(u.type))
  ]) {
    out.set(unit.bytes, offset)
    offset += unit.bytes.length
  }
  return out
}
