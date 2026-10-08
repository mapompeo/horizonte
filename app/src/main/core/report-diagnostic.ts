import { REPO_URL } from '../../shared/api'
import type { DiagnosticReportResult } from '../../shared/api'
import type { Snapshot } from '../../shared/types'
import { buildDiagnostic, diagnosticErrorCode, type DiagnosticEnv } from './diagnostic'

const ISSUE_URL = `${REPO_URL}/issues/new?labels=diagnostico`
// Orçamento local conservador, não uma garantia do limite de todos os navegadores/servidores.
const MAX_URL = 6000
const ERROR_LINE =
  /^Erro: (?:MONITOR_VIRTUAL_NAO_ENCONTRADO|SUNSHINE_INDISPONIVEL|MOONLIGHT_FALHOU|DRIVER_INSTALACAO_FALHOU|ERRO_NAO_CLASSIFICADO)$/

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

export function createDiagnosticReporter(deps: {
  text(includeHistory: boolean): Promise<string>
  open(url: string): Promise<unknown>
  copy(text: string): void
}): {
  prepare(includeHistory: unknown): Promise<string>
  report(text: unknown): Promise<DiagnosticReportResult>
} {
  let reviewed: string | null = null
  return {
    async prepare(includeHistory) {
      reviewed = null
      if (typeof includeHistory !== 'boolean') throw new Error('Opção de histórico inválida.')
      const text = reportSummary(await deps.text(includeHistory))
      reviewed = text
      return text
    },
    async report(text) {
      if (typeof text !== 'string' || !text || text !== reviewed)
        throw new Error('Revise o diagnóstico antes de abrir o GitHub.')
      const url = new URL(ISSUE_URL)
      url.searchParams.set('title', 'Diagnóstico do Horizonte')
      url.searchParams.set('body', text)
      if (url.href.length > MAX_URL) {
        deps.copy(text)
        await deps.open(ISSUE_URL)
        return 'copied'
      }
      await deps.open(url.href)
      return 'opened'
    }
  }
}
