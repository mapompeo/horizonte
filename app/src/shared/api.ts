import type { AppEvent, Host, Settings, SettingsPatch, Snapshot, WebAccess } from './types'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  webAccess: 'horizonte:web-access',
  setWebAccess: 'horizonte:set-web-access',
  openRepo: 'horizonte:open-repo',
  copyDiagnostic: 'horizonte:copy-diagnostic',
  push: 'horizonte:push'
} as const

/** Endereço do projeto: fixo, o processo principal nunca abre um endereço vindo da interface. */
export const REPO_URL = 'https://github.com/mapompeo/horizonte'

export interface HorizonteApi {
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
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void
}

declare global {
  interface Window {
    horizonte: HorizonteApi
  }
}
