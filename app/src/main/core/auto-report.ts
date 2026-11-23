/**
 * Envio automático de erros (só para quem ligou nos Ajustes): quando a tela de erro aparece, o relatório sem dados
 * pessoais vai sozinho para as Issues. Limites para nunca virar spam nem gastar a rede da pessoa: um envio por código
 * de erro por dia, no máximo `MAX_PER_DAY` por dia, e um de cada vez. Se falhar (sem internet), não conta e tenta no
 * próximo erro.
 */
export const MAX_PER_DAY = 3
const DAY_MS = 24 * 60 * 60 * 1000

export interface AutoReportDeps {
  enabled(): boolean
  /** Manda o relatório do erro `code`; true quando o servidor aceitou. */
  send(code: string): Promise<boolean>
  now(): number
  /** Quando cada código foi enviado pela última vez (ms). */
  load(): Record<string, number>
  save(sent: Record<string, number>): void
}

export function createAutoReporter(deps: AutoReportDeps): {
  onError(code: string): Promise<'sent' | 'skipped' | 'failed'>
} {
  let busy = false
  return {
    async onError(code) {
      if (!deps.enabled() || busy) return 'skipped'
      const now = deps.now()
      const recent = Object.fromEntries(
        Object.entries(deps.load()).filter(([, at]) => now - at < DAY_MS)
      )
      if (code in recent || Object.keys(recent).length >= MAX_PER_DAY) return 'skipped'
      busy = true
      try {
        if (!(await deps.send(code))) return 'failed'
        deps.save({ ...recent, [code]: now })
        return 'sent'
      } catch {
        return 'failed'
      } finally {
        busy = false
      }
    }
  }
}
