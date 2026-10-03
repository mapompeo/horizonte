import type { Host, PrepProgress, PrepStep, Settings } from '../../shared/types'

export interface PairRequest {
  device: string
  pairingId: string
  pin?: string
}

export interface ApproveRequest {
  pairingId: string
  pin: string
  name: string
}

/** Papel de quem envia a tela (Sunshine). */
export interface ServerEngine {
  prepare(
    onStep: (step: PrepStep) => void,
    settings: Settings,
    onProgress?: (progress: PrepProgress) => void
  ): Promise<void>
  /**
   * Interrompe o que o modo enviar deixou em andamento (preparação, espera por conexão
   * ou pedido de pareamento pendente). Chamado ao sair desse modo sem ter conectado.
   */
  abort(): Promise<void>
  approve(request: ApproveRequest): Promise<void>
  deny(pairingId: string): Promise<void>
  stopSending(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
  onPairRequest(callback: (request: PairRequest) => void): () => void
  onPairCancelled(callback: (pairingId: string) => void): () => void
  onClientConnected(callback: (device: string) => void): () => void
  onClientDisconnected(callback: () => void): () => void
}

/** Papel de quem recebe a tela (Moonlight). */
export interface ClientEngine {
  listHosts(): Promise<Host[]>
  connect(host: string, settings: Settings): Promise<void>
  disconnect(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
  onStreamEnded(callback: () => void): () => void
}

/** Tudo que o núcleo precisa do motor. */
export interface EnginePort extends ServerEngine, ClientEngine {}
