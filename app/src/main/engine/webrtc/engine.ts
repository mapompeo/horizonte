import type { DeviceKind } from '../../../shared/device'
import type { Host, PrepProgress, PrepStep, ScreenSize, Settings } from '../../../shared/types'
import type { ApproveRequest, EnginePort, PairRequest } from '../port'
import type { VirtualScreen } from './display'
import { PROTOCOL_VERSION, SIGNALING_PORT, type Hello, type Want } from './protocol'
import {
  connect,
  startSender,
  type MediaSide,
  type Sender,
  type SenderOptions,
  type Session
} from './session'

/** Um aparelho que está pronto para enviar a tela, como a descoberta o encontrou. */
export interface WebRtcHost extends Host {
  /** Porta da sinalização dele. */
  port: number
}

/** Anúncio e busca na rede local (`_horizonte._tcp`). */
export interface LanPresence {
  /** Com porta: este aparelho anuncia que está pronto para enviar; null: deixa de anunciar. */
  setSending(port: number | null): void
  hosts(): Promise<WebRtcHost[]>
}

export interface MediaHooks {
  beforeStart?(want: Want): Promise<{ frames?: string } | void>
  afterStop?(): void
  onError?(error: Error): void
}

/** A janela de exibição de uma sessão de quem mostra. */
export interface ReceiverWindow {
  codecs: string[]
  /** Tamanho da tela onde ela abriu, em pixels de verdade: é o tamanho pedido para a tela estendida. */
  size: ScreenSize
  media(): MediaSide
  /** A pessoa pediu para sair (segurou Esc ou fechou a janela). */
  onQuit(callback: () => void): void
  close(): void
}

/** As janelas do motor (no app, `electron.ts`; nos testes, de mentira). */
export interface MotorWindows {
  identity(): Promise<{ id: string; fp: string }>
  sendMedia(hooks: MediaHooks): MediaSide
  openReceiver(): Promise<ReceiverWindow>
}

export interface WebRtcEngineDeps {
  windows: MotorWindows
  presence: LanPresence
  /** Monitor virtual deste sistema; sem ele, a tela principal é espelhada. */
  virtualScreen: VirtualScreen | null
  /** Socket do auxiliar com as imagens da tela estendida (GNOME), quando houver. */
  frames: string | null
  deviceName(): string
  kind(): DeviceKind
  screenSize(): ScreenSize
  /** Ajustes da sinalização (nos testes: porta 0 em 127.0.0.1, sem ping). */
  signaling?: Pick<SenderOptions, 'port' | 'host' | 'pingMs' | 'helloTimeoutMs'>
  log?(...parts: unknown[]): void
}

type Listener<A extends unknown[]> = (...args: A) => void

function listeners<A extends unknown[]>(): {
  on(callback: Listener<A>): () => void
  emit(...args: A): void
} {
  const set = new Set<Listener<A>>()
  return {
    on(callback) {
      set.add(callback)
      return () => set.delete(callback)
    },
    emit(...args) {
      for (const callback of [...set]) callback(...args)
    }
  }
}

/**
 * Motor próprio do Horizonte: WebRTC entre as janelas do motor, sinalização TCP entre os processos principais e
 * aprovação pela pessoa (sem PIN; a confiança é pela impressão digital do certificado, decidida pelo núcleo).
 */
export class WebRtcEngine implements EnginePort {
  private sender: Sender | null = null
  private starting: Promise<Sender> | null = null
  private identity: { id: string; fp: string } | null = null
  private sending: Session | null = null
  private receiving: {
    session: Session | null
    window: ReceiverWindow
    abort: AbortController
  } | null = null
  private readonly pending = new Map<string, (approved: boolean) => void>()
  private readonly ports = new Map<string, number>()
  private captureTarget: number | null = null
  private nextPairing = 0

  private readonly pairRequested = listeners<[PairRequest]>()
  private readonly pairCancelled = listeners<[string]>()
  private readonly clientConnected = listeners<[string]>()
  private readonly clientDisconnected = listeners<[]>()
  private readonly streamEnded = listeners<[]>()

  constructor(private readonly deps: WebRtcEngineDeps) {}

  /** A tela que a janela de envio captura (a do monitor virtual, quando há); null: a principal. */
  target(): number | null {
    return this.captureTarget
  }

  private log(...parts: unknown[]): void {
    this.deps.log?.(...parts)
  }

  private hello(identity: { id: string; fp: string }): Hello {
    return {
      t: 'hello',
      v: PROTOCOL_VERSION,
      id: identity.id,
      name: this.deps.deviceName(),
      kind: this.deps.kind(),
      fp: identity.fp,
      screen: this.deps.screenSize()
    }
  }

  private async ownIdentity(): Promise<{ id: string; fp: string }> {
    this.identity ??= await this.deps.windows.identity()
    return this.identity
  }

  // ---------- quem envia ----------

  async prepare(
    onStep: (step: PrepStep) => void,
    _settings: Settings,
    onProgress?: (progress: PrepProgress) => void
  ): Promise<void> {
    onStep('engine')
    onProgress?.({ note: 'Abrindo o motor de transmissão', fraction: 0.2 })
    const identity = await this.ownIdentity()
    onStep('display')
    onProgress?.({ note: 'Preparando a tela estendida', fraction: 0.5 })
    onStep('encoder')
    onProgress?.({ note: 'Esperando conexão', fraction: 0.9 })
    const sender = await this.listen(identity)
    this.deps.presence.setSending(sender.port)
  }

  private listen(identity: { id: string; fp: string }): Promise<Sender> {
    if (this.sender) return Promise.resolve(this.sender)
    this.starting ??= startSender({
      ...this.deps.signaling,
      hello: () => this.hello(identity),
      approve: (peer, address, cancelled) => this.ask(peer, address, cancelled),
      media: () => this.sendMedia(),
      onSession: (session) => this.onSending(session),
      onError: (error) => this.log('sinalização:', error.message)
    }).then(
      (sender) => {
        this.sender = sender
        this.starting = null
        return sender
      },
      (error: unknown) => {
        this.starting = null
        throw error
      }
    )
    return this.starting
  }

  /** Pergunta à pessoa (pelo núcleo) se este aparelho pode ver a tela. */
  private ask(peer: Hello, address: string, cancelled: Promise<void>): Promise<boolean> {
    const pairingId = `p${++this.nextPairing}`
    return new Promise<boolean>((resolve) => {
      this.pending.set(pairingId, resolve)
      void cancelled.then(() => {
        if (!this.pending.delete(pairingId)) return
        this.pairCancelled.emit(pairingId)
      })
      this.pairRequested.emit({
        device: peer.name,
        pairingId,
        address,
        deviceId: peer.id,
        fingerprint: peer.fp
      })
    })
  }

  private sendMedia(): MediaSide {
    const virtual = this.deps.virtualScreen
    return this.deps.windows.sendMedia({
      beforeStart: async (want) => {
        if (!virtual) return
        this.captureTarget = await virtual.ensure({
          width: want.width,
          height: want.height,
          fps: want.fps
        })
        return this.deps.frames ? { frames: this.deps.frames } : undefined
      },
      afterStop: () => {
        this.captureTarget = null
        void virtual?.release()
      },
      onError: (error) => {
        this.log('tela estendida:', error.message)
        this.sending?.end('error')
      }
    })
  }

  private onSending(session: Session): void {
    this.sending = session
    session.onEnded(() => {
      if (this.sending !== session) return
      this.sending = null
      this.clientDisconnected.emit()
    })
    this.clientConnected.emit(session.peer.name)
  }

  async approve(request: ApproveRequest): Promise<void> {
    const resolve = this.pending.get(request.pairingId)
    if (!resolve) throw new Error('Esse pedido não está mais esperando resposta.')
    this.pending.delete(request.pairingId)
    resolve(true)
  }

  async deny(pairingId: string): Promise<void> {
    const resolve = this.pending.get(pairingId)
    this.pending.delete(pairingId)
    resolve?.(false)
  }

  async stopSending(): Promise<void> {
    const session = this.sending
    this.sending = null
    session?.end('user')
  }

  async abort(): Promise<void> {
    for (const resolve of this.pending.values()) resolve(false)
    this.pending.clear()
    this.deps.presence.setSending(null)
    await this.stopSending()
    const sender = this.sender ?? (await this.starting?.catch(() => null))
    this.sender = null
    await sender?.stop()
  }

  // ---------- quem mostra ----------

  async listHosts(): Promise<Host[]> {
    const hosts = await this.deps.presence.hosts()
    for (const host of hosts) this.ports.set(host.address, host.port)
    return hosts.map((host) => ({ name: host.name, address: host.address, kind: host.kind }))
  }

  async connect(host: string, settings: Settings): Promise<void> {
    await this.disconnect()
    const identity = await this.ownIdentity()
    const window = await this.deps.windows.openReceiver()
    const abort = new AbortController()
    const current = { session: null as Session | null, window, abort }
    this.receiving = current
    window.onQuit(() => {
      if (this.receiving !== current) return
      void this.disconnect().then(() => this.streamEnded.emit())
    })
    const want: Want = {
      t: 'want',
      width: window.size.width,
      height: window.size.height,
      fps: settings.fps,
      bitrate: settings.bitrate,
      codecs: window.codecs
    }
    try {
      const session = await connect({
        ...this.deps.signaling,
        host,
        port: this.ports.get(host) ?? SIGNALING_PORT,
        hello: this.hello(identity),
        want,
        media: () => window.media(),
        signal: abort.signal
      })
      if (this.receiving !== current) {
        session.end('user')
        return
      }
      current.session = session
      session.onEnded(() => {
        if (this.receiving !== current) return
        this.receiving = null
        window.close()
        this.streamEnded.emit()
      })
    } catch (error) {
      if (this.receiving === current) {
        this.receiving = null
        window.close()
      }
      throw error
    }
  }

  async disconnect(): Promise<void> {
    const current = this.receiving
    if (!current) return
    this.receiving = null
    current.abort.abort()
    current.session?.end('user')
    current.window.close()
  }

  async applyBitrate(mbps: number): Promise<void> {
    this.receiving?.session?.send({ t: 'bitrate', mbps })
  }

  onPairRequest(callback: (request: PairRequest) => void): () => void {
    return this.pairRequested.on(callback)
  }
  onPairCancelled(callback: (pairingId: string) => void): () => void {
    return this.pairCancelled.on(callback)
  }
  onClientConnected(callback: (device: string) => void): () => void {
    return this.clientConnected.on(callback)
  }
  onClientDisconnected(callback: () => void): () => void {
    return this.clientDisconnected.on(callback)
  }
  onStreamEnded(callback: () => void): () => void {
    return this.streamEnded.on(callback)
  }
}
