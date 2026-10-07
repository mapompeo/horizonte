import type { SunshineApiPort } from './api'
import { countStartups, isStartupComplete, logSignature } from './log'

export interface RestarterDeps {
  api: Pick<SunshineApiPort, 'restart' | 'getConfig'>
  /** Substitui `api.restart`, que no Windows pode deixar o processo preso. */
  restart?(): Promise<void>
  readLog(): Promise<string>
  sleep(ms: number): Promise<void>
  timeoutMs?: number
  pollMs?: number
}

/**
 * Reinicia o Sunshine e só devolve o log quando ele é de uma partida NOVA e já terminou de subir.
 * Ler o log antigo como se fosse o novo é o erro clássico aqui, por isso comparamos a assinatura
 * (primeira linha) e o número de partidas de antes do reinício.
 */
export function createRestarter(deps: RestarterDeps): (alive?: () => boolean) => Promise<string> {
  const timeoutMs = deps.timeoutMs ?? 45_000
  const pollMs = deps.pollMs ?? 500

  return async (alive = () => true) => {
    if (!alive()) return ''
    const beforeLog = await deps.readLog()
    if (!alive()) return ''
    const before = { signature: logSignature(beforeLog), startups: countStartups(beforeLog) }

    await (deps.restart ?? (() => deps.api.restart()))()
    if (!alive()) return ''

    const polls = Math.max(1, Math.ceil(timeoutMs / pollMs))
    for (let i = 0; i < polls; i++) {
      await deps.sleep(pollMs)
      if (!alive()) return ''
      const log = await deps.readLog()
      if (!alive()) return ''
      const fresh = logSignature(log) !== before.signature || countStartups(log) > before.startups
      if (!fresh || !isStartupComplete(log)) continue
      try {
        await deps.api.getConfig()
      } catch {
        continue
      }
      if (!alive()) return ''
      return log
    }
    throw new Error(
      'O motor de transmissão não voltou depois de reiniciar. Feche o Horizonte, abra de novo e tente outra vez.'
    )
  }
}
