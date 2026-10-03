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

/** O `signal` é abortado quando o tempo acaba: a sondagem deve parar de mexer no Sunshine. */
export type Probe = (candidate: EncoderCandidate, signal?: AbortSignal) => Promise<boolean>

export interface ChosenEncoder {
  candidate: EncoderCandidate
  /** Verdadeiro quando o processador foi usado sem que o usuário o tivesse pedido. */
  fellBack: boolean
  /**
   * Verdadeiro quando alguma sondagem falhou ou estourou o tempo em vez de responder "não".
   * Não prova que falta GPU, então ninguém deve lembrar disso como definitivo.
   */
  inconclusive: boolean
}

type Verdict = 'yes' | 'no' | 'unknown'

function attempt(probe: Probe, candidate: EncoderCandidate, timeoutMs: number): Promise<Verdict> {
  return new Promise((resolve) => {
    const abort = new AbortController()
    const timer = setTimeout(() => {
      abort.abort()
      resolve('unknown')
    }, timeoutMs)
    const finish = (verdict: Verdict): void => {
      clearTimeout(timer)
      resolve(verdict)
    }
    Promise.resolve()
      .then(() => probe(candidate, abort.signal))
      .then(
        (ok) => finish(ok === true ? 'yes' : 'no'),
        () => finish('unknown')
      )
  })
}

export async function chooseEncoder(
  probe: Probe,
  preference: Encoding = 'auto',
  timeoutMs = 8000
): Promise<ChosenEncoder> {
  if (preference === 'cpu') return { candidate: CPU_ENCODER, fellBack: false, inconclusive: false }

  let inconclusive = false
  for (const candidate of GPU_ENCODERS) {
    const verdict = await attempt(probe, candidate, timeoutMs)
    if (verdict === 'yes') return { candidate, fellBack: false, inconclusive: false }
    if (verdict === 'unknown') inconclusive = true
  }
  return { candidate: CPU_ENCODER, fellBack: true, inconclusive }
}
