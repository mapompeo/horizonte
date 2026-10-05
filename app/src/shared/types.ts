export type Mode = 'send' | 'receive'
export type PrepStep = 'engine' | 'display' | 'encoder'

/** O que a preparação está fazendo agora, em palavras, e quanto do caminho todo já foi (0 a 1). */
export interface PrepProgress {
  note: string
  fraction: number
  /** O Windows está pedindo (ou vai pedir em instantes) a permissão de administrador. */
  permission?: boolean
}

export interface AppError {
  message: string
  detail?: string
}

export type AppState =
  | { screen: 'install' }
  | { screen: 'choose' }
  | {
      screen: 'preparing'
      mode: 'send'
      step: PrepStep
      progress?: PrepProgress
      /** Preparação do botão Começar: ao terminar volta para a escolha, não para a espera. */
      firstRun?: true
    }
  | { screen: 'ready'; mode: 'send' }
  | { screen: 'approve'; mode: 'send'; device: string; pairingId: string; pin: string | null }
  | { screen: 'connected'; mode: 'send'; device: string }
  | { screen: 'discover'; mode: 'receive' }
  | { screen: 'receiving'; mode: 'receive'; host: string; name: string }
  | { screen: 'error'; mode: Mode; error: AppError }

export type AppEvent =
  | { type: 'INSTALL_DONE' }
  | { type: 'CHOOSE'; mode: Mode }
  | { type: 'PREP_STEP'; step: PrepStep }
  | { type: 'PREP_PROGRESS'; progress: PrepProgress }
  | { type: 'PREP_DONE' }
  | { type: 'PAIR_REQUEST'; device: string; pairingId: string; pin?: string }
  | { type: 'PAIR_CANCELLED'; pairingId: string }
  | { type: 'APPROVE'; pin?: string }
  | { type: 'DENY' }
  | { type: 'CLIENT_CONNECTED'; device: string }
  | { type: 'CLIENT_DISCONNECTED' }
  | { type: 'STOP' }
  | { type: 'CONNECT'; host: string; name: string }
  | { type: 'STREAM_ENDED' }
  | { type: 'FAIL'; error: AppError }
  | { type: 'RETRY' }

export type ProfileId = 'economico' | 'equilibrado' | 'maximo' | 'custom'
export type Resolution = '720p' | '1080p' | '1440p'
export type Fps = 30 | 60 | 120
export type Encoding = 'auto' | 'gpu' | 'cpu'
export type Codec = 'h264' | 'hevc' | 'av1'

export interface Settings {
  profile: ProfileId
  bitrate: number
  resolution: Resolution
  fps: Fps
  encoding: Encoding
  codec: Codec
  autostart: boolean
  deviceName: string
  /** Último modo escolhido neste aparelho; null até a pessoa escolher pela primeira vez. */
  mode: Mode | null
}

/** O perfil é sempre derivado do bitrate, por isso não pode ser alterado diretamente. */
export type SettingsPatch = Partial<Omit<Settings, 'profile' | 'mode'>>

export interface Host {
  name: string
  address: string
}

export interface Snapshot {
  state: AppState
  settings: Settings
}

/** Receber pelo navegador: onde abrir e com qual acesso. */
export interface WebAccess {
  on: boolean
  url?: string
  user?: string
  code?: string
  error?: string
}
