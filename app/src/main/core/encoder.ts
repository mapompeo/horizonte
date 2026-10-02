import type { Encoding } from '../../shared/types'

export interface EncoderCandidate {
  id: string
  kind: 'gpu' | 'cpu'
  amdUsage?: 'lowlatency_high_quality' | 'transcoding'
}

/**
 * Ordem aprendida na prática: a RX 580 recusa `lowlatency` e `ultralowlatency`,
 * mas aceita `lowlatency_high_quality` e `transcoding`.
 */
export const GPU_ENCODERS: readonly EncoderCandidate[] = [
  { id: 'gpu-lowlatency_high_quality', kind: 'gpu', amdUsage: 'lowlatency_high_quality' },
  { id: 'gpu-transcoding', kind: 'gpu', amdUsage: 'transcoding' }
]

export const CPU_ENCODER: EncoderCandidate = { id: 'cpu', kind: 'cpu' }

export type Probe = (candidate: EncoderCandidate) => Promise<boolean>

export interface ChosenEncoder {
  candidate: EncoderCandidate
  /** Verdadeiro quando o processador foi usado sem que o usuário o tivesse pedido. */
  fellBack: boolean
}

function attempt(probe: Probe, candidate: EncoderCandidate, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    const finish = (ok: boolean): void => {
      clearTimeout(timer)
      resolve(ok)
    }
    Promise.resolve()
      .then(() => probe(candidate))
      .then((ok) => finish(ok === true), () => finish(false))
  })
}

export async function chooseEncoder(
  probe: Probe,
  preference: Encoding = 'auto',
  timeoutMs = 8000
): Promise<ChosenEncoder> {
  if (preference === 'cpu') return { candidate: CPU_ENCODER, fellBack: false }

  for (const candidate of GPU_ENCODERS) {
    if (await attempt(probe, candidate, timeoutMs)) return { candidate, fellBack: false }
  }
  return { candidate: CPU_ENCODER, fellBack: true }
}
