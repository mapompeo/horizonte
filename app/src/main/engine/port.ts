import type { Host, PrepStep, Settings } from '../../shared/types'

export interface EngineEvents {
  onPairRequest(callback: (device: string) => void): () => void
  onClientConnected(callback: (device: string) => void): () => void
  onClientDisconnected(callback: () => void): () => void
  onStreamEnded(callback: () => void): () => void
}

/** Tudo que o núcleo precisa do motor de streaming. Os planos seguintes trazem as implementações reais. */
export interface EnginePort extends EngineEvents {
  prepare(onStep: (step: PrepStep) => void, settings: Settings): Promise<void>
  /**
   * Interrompe o que o modo enviar deixou em andamento (preparação, espera por conexão
   * ou pedido de pareamento pendente). Chamado ao sair desse modo sem ter conectado.
   */
  abort(): Promise<void>
  approve(): Promise<void>
  deny(): Promise<void>
  stopSending(): Promise<void>
  listHosts(): Promise<Host[]>
  connect(host: string, settings: Settings): Promise<void>
  disconnect(): Promise<void>
  applyBitrate(mbps: number): Promise<void>
}
