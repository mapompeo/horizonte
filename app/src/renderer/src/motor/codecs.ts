/** Ordem quando nenhum codec usa a placa de vídeo: o H.264 por software ainda é o mais leve. */
export const BASE_ORDER = ['video/H264', 'video/AV1', 'video/VP9', 'video/VP8'] as const

/** Entradas que não são codec de vídeo, mas precisam continuar na lista (retransmissão e correção de erro). */
const AUXILIARY = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03'])

export interface CodecProbe {
  mime: string
  supported: boolean
  /** O navegador diz que codifica sem gastar processador (placa de vídeo). */
  powerEfficient: boolean
}

/**
 * Ordem de preferência: primeiro os que usam a placa de vídeo, depois os outros, sempre na ordem base e só os que
 * quem mostra decodifica.
 */
export function rankCodecs(probes: CodecProbe[], decodable: string[]): string[] {
  const accepted = new Set(decodable.map((m) => m.toLowerCase()))
  const usable = BASE_ORDER.filter((mime) =>
    probes.some((p) => p.mime === mime && p.supported && accepted.has(mime.toLowerCase()))
  )
  const efficient = (mime: string): boolean =>
    probes.some((p) => p.mime === mime && p.powerEfficient)
  return [...usable.filter(efficient), ...usable.filter((m) => !efficient(m))]
}

/**
 * Reordena a lista do `getCapabilities` para o `setCodecPreferences`: os escolhidos na ordem pedida (todas as
 * variantes de cada um, como os perfis do H.264), depois as entradas auxiliares. Os outros codecs saem.
 */
export function orderCodecList<T extends { mimeType: string }>(codecs: T[], ranked: string[]): T[] {
  const lower = (mime: string): string => mime.toLowerCase()
  const chosen = ranked.flatMap((mime) => codecs.filter((c) => lower(c.mimeType) === lower(mime)))
  const auxiliary = codecs.filter((c) => AUXILIARY.has(lower(c.mimeType)))
  return [...chosen, ...auxiliary]
}

/** Os codecs de vídeo de verdade de uma lista de capacidades, sem repetir e sem os auxiliares. */
export function videoMimes(codecs: { mimeType: string }[]): string[] {
  const seen = new Map<string, string>()
  for (const { mimeType } of codecs) {
    const key = mimeType.toLowerCase()
    if (!AUXILIARY.has(key) && !seen.has(key)) seen.set(key, mimeType)
  }
  return [...seen.values()]
}
