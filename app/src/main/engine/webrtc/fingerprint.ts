import { isFingerprint } from './protocol'

/**
 * A impressão digital SHA-256 que o SDP declara para o DTLS. Se o SDP trouxer mais de uma diferente (ou nenhuma, ou
 * só de outro algoritmo), devolve null: quem chama trata como SDP suspeito.
 */
export function sdpFingerprint(sdp: string): string | null {
  const found = new Set<string>()
  for (const line of sdp.split(/\r?\n/)) {
    const match = /^a=fingerprint:(\S+) (\S+)$/i.exec(line.trim())
    if (!match) continue
    if (match[1].toLowerCase() !== 'sha-256') return null
    found.add(match[2].toUpperCase())
  }
  if (found.size !== 1) return null
  const [fingerprint] = found
  return isFingerprint(fingerprint) ? fingerprint : null
}
