export type Mode = 'send' | 'receive'
export type PrepStep = 'engine' | 'display' | 'encoder'

export interface AppError {
  message: string
  detail?: string
}

export type AppState =
  | { screen: 'install' }
  | { screen: 'choose' }
  | { screen: 'preparing'; mode: 'send'; step: PrepStep }
  | { screen: 'ready'; mode: 'send' }
  | { screen: 'approve'; mode: 'send'; device: string }
  | { screen: 'connected'; mode: 'send'; device: string }
  | { screen: 'discover'; mode: 'receive' }
  | { screen: 'receiving'; mode: 'receive'; host: string; name: string }
  | { screen: 'error'; mode: Mode; error: AppError }

export type AppEvent =
  | { type: 'INSTALL_DONE' }
  | { type: 'CHOOSE'; mode: Mode }
  | { type: 'PREP_STEP'; step: PrepStep }
  | { type: 'PREP_DONE' }
  | { type: 'PAIR_REQUEST'; device: string }
  | { type: 'APPROVE' }
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
}

/** O perfil é sempre derivado do bitrate, por isso não pode ser alterado diretamente. */
export type SettingsPatch = Partial<Omit<Settings, 'profile'>>

export interface Host {
  name: string
  address: string
}

export interface Snapshot {
  state: AppState
  settings: Settings
}
