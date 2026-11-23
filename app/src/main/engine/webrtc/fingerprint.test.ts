import { describe, expect, it } from 'vitest'
import { sdpFingerprint } from './fingerprint'

const FP = 'AB:'.repeat(31) + 'CD'
const OTHER = 'EF:'.repeat(31) + '01'

// Trecho de uma oferta do Chromium: a impressão digital aparece uma vez por seção de mídia.
const offer = (fingerprints: string[]): string =>
  [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 1',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:abcd',
    ...fingerprints.slice(0, 1).map((f) => `a=fingerprint:sha-256 ${f}`),
    'a=setup:actpass',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    ...fingerprints.slice(1).map((f) => `a=fingerprint:sha-256 ${f}`),
    ''
  ].join('\r\n')

describe('sdpFingerprint', () => {
  it('lê a impressão digital SHA-256', () => {
    expect(sdpFingerprint(offer([FP]))).toBe(FP)
  })

  it('aceita a mesma em várias seções e em minúsculas', () => {
    expect(sdpFingerprint(offer([FP, FP.toLowerCase()]))).toBe(FP)
  })

  it('recusa duas diferentes', () => {
    expect(sdpFingerprint(offer([FP, OTHER]))).toBeNull()
  })

  it('recusa SDP sem impressão digital', () => {
    expect(sdpFingerprint(offer([]))).toBeNull()
  })

  it('recusa outro algoritmo', () => {
    expect(sdpFingerprint('a=fingerprint:sha-1 AB:CD:EF\r\n')).toBeNull()
  })
})
