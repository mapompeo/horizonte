import type { AppEvent, Host, Settings, SettingsPatch, Snapshot, WebAccess } from './types'
import type { UpdateAction, UpdateStatus } from './updates'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  webAccess: 'horizonte:web-access',
  setWebAccess: 'horizonte:set-web-access',
  openRepo: 'horizonte:open-repo',
  copyDiagnostic: 'horizonte:copy-diagnostic',
  uninstall: 'horizonte:uninstall',
  diagnosticDraft: 'horizonte:diagnostic-draft',
  reportDiagnostic: 'horizonte:report-diagnostic',
  push: 'horizonte:push',
  update: 'horizonte:update',
  updateStatus: 'horizonte:update-status',
  updatePush: 'horizonte:update-push'
} as const

/** Endereço do projeto: fixo, o processo principal nunca abre um endereço vindo da interface. */
export const REPO_URL = 'https://github.com/mapompeo/horizonte'
export type DiagnosticReportResult = 'opened' | 'copied'

export interface HorizonteApi {
  /** Sistema em que o app roda (`process.platform`): win32, darwin ou linux. */
  platform: string
  getSnapshot(): Promise<Snapshot>
  dispatch(event: AppEvent): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  getWebAccess(): Promise<WebAccess>
  setWebAccess(on: boolean): Promise<WebAccess>
  /** Abre a página do projeto no navegador padrão. */
  openRepo(): Promise<void>
  /** Copia o diagnóstico (versão, sistema, tela e erro, sem dados pessoais). Devolve se deu certo. */
  copyDiagnostic(): Promise<boolean>
  uninstall(): Promise<import('./uninstall').UninstallResult>
  getDiagnosticDraft(includeHistory: boolean): Promise<string>
  reportDiagnostic(reviewedText: string): Promise<DiagnosticReportResult>
  getUpdateStatus(): Promise<UpdateStatus>
  update(action: UpdateAction): Promise<UpdateStatus>
  onUpdate(callback: (status: UpdateStatus) => void): () => void
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void
}

declare global {
  interface Window {
    horizonte: HorizonteApi
  }
}
