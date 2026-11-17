import type { VideoHint } from '../main/platform/linux/video-driver'
import type { DeviceKind } from './device'
import type {
  AppEvent,
  Host,
  ScreenSize,
  Settings,
  SettingsPatch,
  Snapshot,
  WebAccess
} from './types'
import type { UpdateAction, UpdateStatus } from './updates'

export const CHANNELS = {
  snapshot: 'horizonte:snapshot',
  dispatch: 'horizonte:dispatch',
  updateSettings: 'horizonte:update-settings',
  hosts: 'horizonte:hosts',
  mousePeers: 'horizonte:mouse-peers',
  mouseScreen: 'horizonte:mouse-screen',
  videoHint: 'horizonte:video-hint',
  deviceKind: 'horizonte:device-kind',
  webAccess: 'horizonte:web-access',
  setWebAccess: 'horizonte:set-web-access',
  openRepo: 'horizonte:open-repo',
  uninstall: 'horizonte:uninstall',
  reportDiagnostic: 'horizonte:report-diagnostic',
  push: 'horizonte:push',
  update: 'horizonte:update',
  updateStatus: 'horizonte:update-status',
  updatePush: 'horizonte:update-push'
} as const

/** Endereço do projeto: fixo, o processo principal nunca abre um endereço vindo da interface. */
export const REPO_URL = 'https://github.com/mapompeo/horizonte'

export interface HorizonteApi {
  /** Sistema em que o app roda (`process.platform`): win32, darwin ou linux. */
  platform: string
  getSnapshot(): Promise<Snapshot>
  dispatch(event: AppEvent): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  listHosts(): Promise<Host[]>
  /** Outros PCs com o Horizonte no modo Mouse. */
  listMousePeers(): Promise<Host[]>
  /** Área de trabalho deste computador (todas as telas juntas), para o mapa do modo Mouse. */
  ownScreen(): Promise<ScreenSize>
  /**
   * Tipo de um aparelho para o ícone: o que ele anuncia na rede, ou um palpite pelo nome. Sem argumentos, o tipo
   * deste aparelho.
   */
  deviceKind(address?: string, name?: string): Promise<DeviceKind>
  /** Falta o driver de vídeo da placa (Linux): o aviso, ou null quando está tudo certo. */
  videoHint(): Promise<VideoHint | null>
  getWebAccess(): Promise<WebAccess>
  setWebAccess(on: boolean): Promise<WebAccess>
  /** Abre a página do projeto no navegador padrão. */
  openRepo(): Promise<void>
  uninstall(): Promise<import('./uninstall').UninstallResult>
  /** Manda o diagnóstico (só versão, sistema e códigos de erro) para quem mantém o Horizonte. */
  reportDiagnostic(): Promise<void>
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
