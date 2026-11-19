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
  openErrorHelp: 'horizonte:open-error-help',
  uninstall: 'horizonte:uninstall',
  reportDiagnostic: 'horizonte:report-diagnostic',
  copyText: 'horizonte:copy-text',
  shareLink: 'horizonte:share-link',
  firewall: 'horizonte:firewall',
  shortcut: 'horizonte:shortcut',
  macAccess: 'horizonte:mac-access',
  openPrivacy: 'horizonte:open-privacy',
  allowFirewall: 'horizonte:allow-firewall',
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
  /** Abre, no navegador padrão, a linha deste código na tabela de erros do site. */
  openErrorHelp(code: string): Promise<void>
  uninstall(): Promise<import('./uninstall').UninstallResult>
  /** Manda o diagnóstico (só versão, sistema e códigos de erro) para quem mantém o Horizonte. */
  reportDiagnostic(): Promise<void>
  /** Copia um texto pela área de transferência do sistema (a da página não funciona em todo sistema). */
  copyText(text: string): Promise<void>
  /** No Mac, abre o menu Compartilhar do sistema (AirDrop) com o link da página. Nos outros, não faz nada. */
  shareLink(url: string): Promise<void>
  /** O atalho que traz a janela, se ele está valendo (no Wayland não vale); null sem atalho. */
  shortcut(): Promise<string | null>
  /** Windows e Mac: se o firewall deixa o Horizonte receber conexões; null no Linux. */
  firewall(): Promise<FirewallState | null>
  /** Windows: tira o bloqueio e libera em redes privadas (pede administrador). Devolve o estado depois. */
  allowFirewall(): Promise<FirewallState | null>
  /** Mac: Gravação de Tela e Acessibilidade; null nos outros sistemas. */
  macAccess(): Promise<MacAccess | null>
  /** Mac: abre os Ajustes do Sistema na permissão certa. */
  openPrivacy(kind: 'screen' | 'accessibility' | 'firewall'): Promise<void>
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

/** 'public': o Windows marcou a rede como Pública, e aí a liberação (só para redes privadas) não vale. */
export type FirewallState = 'allowed' | 'blocked' | 'unknown' | 'public'
export interface MacAccess {
  /** O que o macOS diz da Gravação de Tela: 'not-determined' até ele perguntar. */
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  accessibility: boolean
}
