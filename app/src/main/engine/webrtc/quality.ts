import type { MotorStats } from '../../../shared/motor'
import type { LinkQuality } from '../../../shared/types'

/**
 * A conexão com o aparelho, em três níveis, pelo que o WebRTC mede: ida e volta (na rede de casa, até 25 ms é ótimo e
 * acima de 60 ms já se sente no mouse) e se o codificador está segurando a qualidade por falta de banda. O fps não
 * entra: com a tela parada, o Chromium manda poucos quadros de propósito. Sem medida de ida e volta, null.
 */
export function linkOf(stats: MotorStats): LinkQuality | null {
  const rtt = stats.rttMs
  if (rtt === null) return null
  const starved = stats.qualityLimitation === 'bandwidth'
  return rtt > 60 ? 'poor' : rtt > 25 || starved ? 'fair' : 'good'
}
