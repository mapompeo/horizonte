import type { Snapshot } from '../../shared/types'
import { buildDiagnostic, diagnosticErrorCode, type DiagnosticEnv } from './diagnostic'

/** Recebe o diagnóstico no site do Horizonte (sem conta no GitHub para quem envia). */
export const DIAGNOSTIC_URL = 'https://horizonte.vercel.app/api/diagnostico'
const ERROR_LINE =
  /^Erro: (?:MONITOR_VIRTUAL_NAO_ENCONTRADO|DRIVER_INSTALACAO_FALHOU|ERRO_NAO_CLASSIFICADO)$/

export function buildReportDiagnostic(env: DiagnosticEnv, snapshot: Snapshot): string {
  if (snapshot.state.screen !== 'error') return buildDiagnostic(env, snapshot)
  const { message, detail } = snapshot.state.error
  return buildDiagnostic(env, {
    ...snapshot,
    state: {
      ...snapshot.state,
      error: { message: diagnosticErrorCode(`${message}\n${detail ?? ''}`) }
    }
  })
}

/** Mensagens e detalhes podem conter logs arbitrários: só metadados conhecidos entram na issue. */
export function reportSummary(text: string): string {
  return text
    .split('\n')
    .filter(
      (line) =>
        /^(Horizonte |Sistema: |Electron |Tela: |Qualidade: |\d{4}-\d{2}-\d{2}T\d{2}:)/.test(
          line
        ) || ERROR_LINE.test(line)
    )
    .join('\n')
}

/** Um clique: monta o resumo (sem textos livres) e manda. */
export function createDiagnosticReporter(deps: {
  text(): Promise<string>
  post(text: string): Promise<boolean>
}): { send(): Promise<void> } {
  return {
    async send() {
      const text = reportSummary(await deps.text())
      if (!(await deps.post(text))) throw new Error('Não consegui enviar agora.')
    }
  }
}
