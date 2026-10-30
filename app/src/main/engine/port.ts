import type {
  ExtendSide,
  Host,
  MouseSide,
  PrepProgress,
  PrepStep,
  Settings
} from '../../shared/types'

export interface PairRequest {
  device: string
  pairingId: string
  /** Só no motor antigo (Moonlight): o PIN que o outro aparelho mandou. */
  pin?: string
  address?: string
  /** Motor próprio: id e impressão digital do certificado do outro aparelho (é nela que vale a confiança). */
  deviceId?: string
  fingerprint?: string
}

export interface ApproveRequest {
  pairingId: string
  /** Só no motor antigo (Moonlight); o motor próprio não usa PIN. */
  pin?: string
  name: string
}

/** Compartilhar mouse e teclado com outro PC (Deskflow), pela rede local. */
/** Um computador encostado neste no modo Mouse: o lado e onde começa a borda dele (fração da borda deste). */
export interface MousePlacement {
  host: Host
  side: MouseSide
  /** Sem valor: centralizado. */
  offset?: number
}

export interface MouseEngine {
  /** Entra no modo: anuncia este PC na rede e passa a escutar pedidos. */
  start(name: string): Promise<void>
  stop(): Promise<void>
  listPeers(): Promise<Host[]>
  /**
   * Este PC empresta o mouse aos computadores encostados nele: sobe o servidor e pede a cada um que se conecte.
   * Quem não responde fica de fora; se ninguém responder, falha.
   */
  share(placements: MousePlacement[], ownName: string): Promise<void>
  /** Muda onde cada um fica, sem encerrar o compartilhamento (eles reconectam sozinhos). */
  setLayout(placements: MousePlacement[]): Promise<void>
  /** Aceita o pedido pendente: este PC passa a ser controlado. */
  accept(ownName: string): Promise<void>
  deny(): Promise<void>
  /** Encerra o compartilhamento e avisa o outro PC. */
  end(): Promise<void>
  onRequest(callback: (request: { device: string; address: string }) => void): () => void
  onEnded(callback: () => void): () => void
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
  /** Muda a posição da tela estendida sem preparar tudo de novo. */
  placeDisplay?(side: ExtendSide): Promise<void>
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
