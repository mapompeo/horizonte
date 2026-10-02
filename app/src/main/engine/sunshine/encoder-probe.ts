import type { EncoderCandidate, Probe } from '../../core/encoder'
import type { SunshineApiPort } from './api'
import { parseFoundEncoder } from './log'

/** Opções da AMD que provamos funcionar na RX 580 (as outras GPUs ignoram estas chaves). */
export function amdConfig(candidate: EncoderCandidate): Record<string, string> {
  if (candidate.kind !== 'gpu' || candidate.amdUsage === undefined) return {}
  return {
    amd_usage: candidate.amdUsage,
    amd_rc: 'cbr',
    amd_quality: 'speed',
    amd_enforce_hrd: 'disabled',
    amd_preanalysis: 'disabled',
    amd_vbaq: 'disabled'
  }
}

/**
 * Testa um candidato do jeito que o Sunshine testa: grava a configuração, reinicia e lê no log
 * se ele achou um encoder de hardware. O resultado é consultivo (o teste da partida já falhou
 * e depois passou com a mesma configuração), por isso quem usa isto nunca força o processador.
 */
export function createLogEncoderProbe(deps: {
  api: Pick<SunshineApiPort, 'saveConfig'>
  restartAndRead: (alive?: () => boolean) => Promise<string>
}): Probe {
  return async (candidate) => {
    await deps.api.saveConfig(amdConfig(candidate))
    const log = await deps.restartAndRead()
    return parseFoundEncoder(log)?.hardware === true
  }
}
