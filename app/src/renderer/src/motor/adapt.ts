import type { StatEntry } from './stats'

/** O que a rede disse no último segundo, do lado que envia. */
export interface NetSignal {
  /** Fração de pacotes perdidos no último relatório de quem mostra (0 a 1); null quando ainda não veio. */
  lossFraction: number | null
  rttMs: number | null
  /** `qualityLimitationReason` do codificador: 'cpu', 'bandwidth', 'none'... */
  limitation: string | null
}

export interface Rate {
  mbps: number
  fps: number
}

/** Perda a partir da qual o Wi-Fi está congestionado. */
const LOSS_BAD = 0.02
/** Ida e volta acima da melhor vista por mais que isto (e 50% acima dela) indica fila na rede. */
const RTT_RISE_MS = 40
/** Segundos seguidos de rede ruim antes de baixar, e de rede boa antes de subir de novo (histerese). */
const BAD_SECONDS = 2
const GOOD_SECONDS = 5
const CPU_SECONDS = 3
const CUT = 0.8
const RAISE = 1.1
/** Quadros por segundo quando a rede ou o processador não dão conta mesmo no mínimo. */
const FALLBACK_FPS = 30

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Lê do `getStats()` de quem envia o que o ajuste usa. */
export function netSignal(entries: StatEntry[]): NetSignal {
  const remote = entries.find(
    (e) => e.type === 'remote-inbound-rtp' && (e.kind ?? e.mediaType) === 'video'
  )
  const outbound = entries.find(
    (e) => e.type === 'outbound-rtp' && (e.kind ?? e.mediaType) === 'video'
  )
  const rtt = num(remote?.roundTripTime)
  return {
    lossFraction: num(remote?.fractionLost),
    rttMs: rtt !== null ? rtt * 1000 : null,
    limitation:
      typeof outbound?.qualityLimitationReason === 'string'
        ? outbound.qualityLimitationReason
        : null
  }
}

/**
 * Qualidade automática: o perfil (Econômico, Equilibrado, Máximo ou o valor à mão) é o teto, e o envio desce dele
 * quando a rede perde pacotes ou enfileira, e volta aos poucos quando ela melhora. Se o processador não dá conta, ou
 * a rede continua ruim já no mínimo, cai para 30 quadros por segundo.
 *
 * `next` recebe um sinal por segundo e devolve a nova taxa só quando ela muda.
 */
export function createAdapter(ceiling: Rate): {
  next(signal: NetSignal): Rate | null
  setCeiling(rate: Rate): void
  current(): Rate
} {
  let top = { ...ceiling }
  let rate = { ...ceiling }
  let bad = 0
  let good = 0
  let cpu = 0
  let bestRtt: number | null = null
  const floor = (): number => Math.max(2, top.mbps * 0.25)

  return {
    current: () => ({ ...rate }),
    setCeiling(next) {
      top = { ...next }
      rate = { ...next }
      bad = good = cpu = 0
    },
    next(signal) {
      if (signal.rttMs !== null)
        bestRtt = bestRtt === null ? signal.rttMs : Math.min(bestRtt, signal.rttMs)
      const lossy = signal.lossFraction !== null && signal.lossFraction >= LOSS_BAD
      const queued =
        signal.rttMs !== null &&
        bestRtt !== null &&
        signal.rttMs > bestRtt + RTT_RISE_MS &&
        signal.rttMs > bestRtt * 1.5
      const before = { ...rate }

      cpu = signal.limitation === 'cpu' ? cpu + 1 : 0
      if (cpu >= CPU_SECONDS && rate.fps > FALLBACK_FPS) {
        rate.fps = FALLBACK_FPS
        cpu = 0
      }

      if (lossy || queued) {
        good = 0
        bad++
        if (bad >= BAD_SECONDS) {
          bad = 0
          if (rate.mbps > floor()) rate.mbps = Math.max(floor(), rate.mbps * CUT)
          else if (rate.fps > FALLBACK_FPS) rate.fps = FALLBACK_FPS
        }
      } else {
        bad = 0
        good++
        if (good >= GOOD_SECONDS) {
          good = 0
          if (rate.mbps < top.mbps) rate.mbps = Math.min(top.mbps, rate.mbps * RAISE)
          else if (rate.fps < top.fps && signal.limitation !== 'cpu') rate.fps = top.fps
        }
      }

      rate.mbps = Math.round(rate.mbps * 10) / 10
      return rate.mbps !== before.mbps || rate.fps !== before.fps ? { ...rate } : null
    }
  }
}
