import type { Message, Want } from '../main/engine/webrtc/protocol'
import type { RawFrame } from './frames'

/** O que as janelas do motor de teste fazem: enviar, mostrar ou exibir o relógio da medição de atraso. */
export type MotorRole = 'send' | 'receive' | 'clock'

export type MediaMessage = Extract<Message, { t: 'offer' | 'answer' | 'ice' | 'bitrate' }>

export interface MotorConfig {
  role: MotorRole
  /** Envia um quadro animado de teste em vez da tela (testes de ponta a ponta). */
  synthetic: boolean
  /** Quem mostra confere a imagem depois deste número de quadros e encerra (testes de ponta a ponta). */
  testFrames: number | null
  showStats: boolean
}

/** Do processo principal para a janela. */
export type ToMotorWindow =
  /** `frames`: socket do auxiliar com as imagens da tela estendida; sem ele, a janela captura a tela. */
  { t: 'start'; want: Want; frames?: string } | { t: 'stop' } | MediaMessage

/** Números de um segundo de sessão, já calculados pela janela. */
export interface MotorStats {
  at: number
  width: number
  height: number
  fps: number
  mbps: number
  codec: string
  /** Codificador ou decodificador em uso, como o Chromium informa (`ExternalEncoder`, `libvpx`...). */
  implementation: string
  rttMs: number | null
  packetsLost: number
  framesDropped: number
  jitterBufferMs: number | null
  /** Captura até a exibição, pelo relógio do WebRTC; null quando o Chromium não informa. */
  latencyMs: number | null
  /** Do último pacote do quadro até a tela (decodificar e desenhar), pelo relógio desta janela. */
  displayMs: number | null
  qualityLimitation: string | null
}

/** Da janela para o processo principal. */
export type MotorReport =
  | { type: 'identity'; id: string; fp: string }
  /** Quem mostra está pronto e diz o que decodifica. */
  | { type: 'ready'; codecs: string[] }
  | { type: 'first-frame' }
  | { type: 'stats'; stats: MotorStats }
  | { type: 'test-result'; ok: boolean; detail: string }
  | { type: 'quit' }
  | { type: 'error'; message: string }

export const MOTOR_CHANNELS = {
  config: 'motor:config',
  signal: 'motor:signal',
  report: 'motor:report',
  push: 'motor:push'
} as const

/** Leitura das imagens que o auxiliar do Linux manda (só na janela de envio). */
export interface MotorFramesApi {
  /** Conecta ao socket; devolve a função que desconecta. */
  open(
    path: string,
    onFrame: (frame: RawFrame) => void,
    onClose: (reason: string) => void
  ): () => void
}

export interface MotorApi {
  config(): Promise<MotorConfig>
  signal(message: MediaMessage): void
  report(report: MotorReport): void
  onMessage(callback: (message: ToMotorWindow) => void): () => void
}
