import type { DeviceKind } from '../../../shared/device'
import { helperCommand, parseInput } from '../../../shared/input'
import type {
  Host,
  MouseSide,
  PrepProgress,
  PrepStep,
  ScreenPlacement,
  ScreenSize,
  Settings
} from '../../../shared/types'
import type { ApproveRequest, ConnectedPeer, EnginePort, PairRequest } from '../port'
import { freePlacement } from '../../../shared/placement'
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
  /** Com dados: este aparelho anuncia que está pronto para enviar; null: deixa de anunciar. */
  setSending(info: { port: number; id: string; fp: string } | null): void
  hosts(): Promise<WebRtcHost[]>
}

export interface MediaHooks {
  beforeStart?(want: Want): Promise<{ frames?: string } | void>
  afterStop?(): void
  onError?(error: Error): void
  onInput?(raw: string): void
}

/** A janela de exibição de uma sessão de quem mostra. */
export interface ReceiverWindow {
  codecs: string[]
  /** Tamanho da tela onde ela abriu, em pixels de verdade: é o tamanho pedido para a tela estendida. */
  size: ScreenSize
  /** Densidade dessa tela (o `scaleFactor`); acima de 1, a tela estendida nasce com essa escala. */
  scale?: number
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

/** Um monitor virtual e o socket das imagens dele (GNOME), um para cada aparelho conectado ao mesmo tempo. */
export interface ScreenSlot {
  screen: VirtualScreen
  frames: string | null
}

export interface WebRtcEngineDeps {
  windows: MotorWindows
  presence: LanPresence
  /**
   * O monitor virtual de número `index` (0, 1, 2…): um por aparelho conectado. Sem isso (null), a tela principal é
   * espelhada.
   */
  screens: ((index: number) => ScreenSlot) | null
  deviceName(): string
  kind(): DeviceKind
  screenSize(): ScreenSize
  /** Onde a pessoa deixou a tela deste aparelho (pela impressão digital); null: ainda não arrastou. */
  placementFor?(fingerprint: string): ScreenPlacement | null
  /** Onde fica quem ainda não tem posição própria. */
  defaultPlacement?(): ScreenPlacement
  /** Preparo do sistema antes de escutar (no Linux, liberar o firewall). */
  prepareSystem?(): Promise<void>
  /** Ajustes da sinalização (nos testes: porta 0 em 127.0.0.1, sem ping). */
  signaling?: Pick<SenderOptions, 'port' | 'host' | 'pingMs' | 'helloTimeoutMs'>
  log?(...parts: unknown[]): void
}

/** Quanto esperar o GNOME assentar a disposição depois de um monitor novo, para posicionar todos de novo. */
const REPLACE_AFTER_MS = 1500

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
  /** Quem está vendo a tela agora, pela impressão digital: a sessão e o monitor virtual de cada um. */
  private readonly viewers = new Map<
    string,
    {
      session: Session | null
      slot: number
      target: number | null
      side?: MouseSide
      placement?: ScreenPlacement | null
      /** O monitor dele já foi criado (o Electron pode demorar a enxergar, e aí `target` fica null). */
      created?: boolean
    }
  >()
  /** Os monitores já criados, por número: um número volta a ficar livre quando o aparelho dele sai. */
  private readonly slots = new Map<number, ScreenSlot>()
  private receiving: {
    session: Session | null
    window: ReceiverWindow
    abort: AbortController
  } | null = null
  private readonly pending = new Map<string, (approved: boolean) => void>()
  private readonly ports = new Map<string, number>()
  private nextPairing = 0

  private readonly pairRequested = listeners<[PairRequest]>()
  private readonly pairCancelled = listeners<[string]>()
  private readonly clientConnected = listeners<[string, ConnectedPeer]>()
  private readonly clientDisconnected = listeners<[string | undefined]>()
  private readonly streamEnded = listeners<[]>()

  constructor(private readonly deps: WebRtcEngineDeps) {}

  /** A tela que a janela de envio captura (a do monitor virtual mais recente, quando há); null: a principal. */
  target(): number | null {
    let last: number | null = null
    for (const viewer of this.viewers.values()) if (viewer.target !== null) last = viewer.target
    return last
  }

  /** O monitor de número livre mais baixo (criado na primeira vez que é preciso). */
  private freeSlot(): number {
    const used = new Set([...this.viewers.values()].map((viewer) => viewer.slot))
    let index = 0
    while (used.has(index)) index++
    return index
  }

  private slot(index: number): ScreenSlot | null {
    if (!this.deps.screens) return null
    let slot = this.slots.get(index)
    if (!slot) {
      slot = this.deps.screens(index)
      this.slots.set(index, slot)
    }
    return slot
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
    onProgress?.({ note: 'Conferindo o firewall', fraction: 0.35 })
    await this.deps.prepareSystem?.()
    onStep('display')
    onProgress?.({ note: 'Preparando a tela estendida', fraction: 0.5 })
    onStep('encoder')
    onProgress?.({ note: 'Esperando conexão', fraction: 0.9 })
    const sender = await this.listen(identity)
    this.deps.presence.setSending({ port: sender.port, id: identity.id, fp: identity.fp })
  }

  private listen(identity: { id: string; fp: string }): Promise<Sender> {
    if (this.sender) return Promise.resolve(this.sender)
    this.starting ??= startSender({
      ...this.deps.signaling,
      hello: () => this.hello(identity),
      approve: (peer, address, cancelled) => this.ask(peer, address, cancelled),
      media: (peer) => this.sendMedia(peer),
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
        fingerprint: peer.fp,
        ...(peer.screen ? { screen: peer.screen } : {})
      })
    })
  }

  private sendMedia(peer: Hello): MediaSide {
    // O mesmo aparelho conectando de novo fica com o monitor que já era dele.
    const index = this.viewers.get(peer.fp)?.slot ?? this.freeSlot()
    const viewer = {
      session: null as Session | null,
      slot: index,
      target: null as number | null,
      side: undefined as MouseSide | undefined,
      placement: null as ScreenPlacement | null,
      created: false
    }
    this.viewers.set(peer.fp, viewer)
    const slot = this.slot(index)
    return this.deps.windows.sendMedia({
      beforeStart: async (want) => {
        if (!slot) return
        viewer.target = await slot.screen.ensure({
          width: want.width,
          height: want.height,
          fps: want.fps,
          ...(want.scale !== undefined ? { scale: want.scale } : {}),
          ...(want.cursor ? { cursor: true } : {})
        })
        const placement = this.placementOf(peer.fp)
        viewer.side = placement?.side
        viewer.placement = placement
        viewer.created = true
        // Um monitor novo faz o GNOME refazer a disposição e desfazer a posição dos que já existiam: todas as telas
        // conectadas voltam para o lugar delas, na ordem em que conectaram.
        await this.placeAgain()
        // O GNOME às vezes refaz a disposição um pouco depois de o monitor aparecer: mais uma vez, já assentado.
        setTimeout(() => void this.placeAgain(), REPLACE_AFTER_MS)
        return slot.frames ? { frames: slot.frames } : undefined
      },
      afterStop: () => {
        viewer.target = null
        viewer.created = false
        if (this.viewers.get(peer.fp) === viewer && !viewer.session) this.viewers.delete(peer.fp)
        if (![...this.viewers.values()].some((other) => other !== viewer && other.slot === index))
          // Sem o monitor deste, o GNOME refaz a disposição: as outras telas voltam para o lugar delas.
          void slot?.screen
            .release()
            .then(() => new Promise((resolve) => setTimeout(resolve, 500)))
            .then(() => this.placeAgain())
      },
      onError: (error) => {
        this.log('tela estendida:', error.message)
        viewer.session?.end('error')
      },
      onInput: (raw) => this.input(peer.fp, raw)
    })
  }

  /**
   * A posição de um aparelho: a que a pessoa deixou para ele ou, sem ela, a padrão. Se outro aparelho conectado já
   * está desse lado, vai para o primeiro lado livre (direita, esquerda, acima, abaixo): uma tela não fica sobre a outra.
   */
  private placementOf(fingerprint: string): ScreenPlacement | null {
    const own = this.deps.placementFor?.(fingerprint)
    if (own) return own
    const fallback = this.deps.defaultPlacement?.() ?? null
    if (!fallback) return null
    const others = [...this.viewers].filter(([fp]) => fp !== fingerprint)
    return freePlacement(
      fallback,
      others.map(([, viewer]) => viewer.side)
    )
  }

  private async placeAgain(): Promise<void> {
    for (const viewer of this.viewers.values()) {
      if (viewer.placement && viewer.created)
        await this.slot(viewer.slot)?.screen.place?.(viewer.placement)
    }
  }

  private onSending(session: Session): void {
    const fp = session.peer.fp
    const viewer = this.viewers.get(fp)
    if (viewer) viewer.session = session
    session.onEnded(() => {
      const current = this.viewers.get(fp)
      if (!current || current.session !== session) return
      this.viewers.delete(fp)
      this.clientDisconnected.emit(fp)
    })
    this.clientConnected.emit(session.peer.name, {
      fingerprint: fp,
      ...(session.peer.screen ? { screen: session.peer.screen } : {})
    })
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

  /** Para de mostrar para um aparelho (pela impressão digital) ou, sem ela, para todos. */
  async stopSending(fingerprint?: string): Promise<void> {
    // Encerrar a sessão já tira o aparelho da lista e avisa a saída (ver `onSending`).
    for (const [fp, viewer] of [...this.viewers]) {
      if (fingerprint && fp !== fingerprint) continue
      viewer.session?.end('user')
    }
  }

  /** Porta em que este aparelho espera conexão (para a página do navegador); null se não está esperando. */
  signalingPort(): number | null {
    return this.sender?.port ?? null
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
      codecs: window.codecs,
      ...(window.scale && window.scale > 1 ? { scale: window.scale } : {}),
      cursor: true
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
  onClientConnected(callback: (device: string, peer?: ConnectedPeer) => void): () => void {
    return this.clientConnected.on(callback)
  }

  /**
   * Entrada de quem mostra (mouse, teclado, toque): só com uma sessão aprovada em andamento, e só o que passa pela
   * conferência do protocolo vira comando para a tela estendida.
   */
  private input(fingerprint: string, raw: string): void {
    const viewer = this.viewers.get(fingerprint)
    if (!viewer?.session) return
    const event = parseInput(raw)
    if (event) this.slot(viewer.slot)?.screen.input?.(helperCommand(event))
  }

  /** Muda na hora a posição da tela de um aparelho conectado (sem a impressão digital: de todos). */
  async placeScreen(placement: ScreenPlacement, fingerprint?: string): Promise<void> {
    for (const [fp, viewer] of this.viewers) {
      if (fingerprint && fp !== fingerprint) continue
      viewer.placement = placement
      viewer.side = placement.side
      if (viewer.session) await this.slot(viewer.slot)?.screen.place?.(placement)
    }
  }
  onClientDisconnected(callback: (fingerprint?: string) => void): () => void {
    return this.clientDisconnected.on(callback)
  }
  onStreamEnded(callback: () => void): () => void {
    return this.streamEnded.on(callback)
  }
}
