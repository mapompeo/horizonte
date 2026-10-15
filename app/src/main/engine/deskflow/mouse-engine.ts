import type { Host, ScreenSize } from '../../../shared/types'
import { cleanName } from '../../../shared/names'
import type { MouseEngine, MousePlacement } from '../port'
import { edgeRanges, type DeskflowLink } from './config'
import type { createFileClipboard, OfferedFile } from './files'
import type { MouseShare } from './session'

/** Porta do canal do modo Mouse: só "quero usar meu mouse aí" e "terminou". */
export const MOUSE_CHANNEL_PORT = 47901

export interface MouseChannel {
  /**
   * Passa a escutar; `onMessage` recebe o caminho, o corpo (JSON) e o endereço de quem mandou. `serve` diz qual
   * arquivo entregar num GET (null: nenhum).
   */
  listen(
    onMessage: (path: string, body: unknown, from: string) => boolean,
    serve?: (path: string, from: string) => string | null
  ): Promise<void>
  close(): Promise<void>
  send(address: string, path: string, body: unknown): Promise<void>
}

export interface MouseEngineDeps {
  share: MouseShare
  channel: MouseChannel
  /** Anuncia este PC na rede local; devolve como parar. */
  advertise(name: string): () => void
  browse(): Promise<Host[]>
  /** Copiar e colar arquivos entre os PCs; sem ele, só o texto copiado vai junto (pelo Deskflow). */
  files?: ReturnType<typeof createFileClipboard>
  /** Área de trabalho deste computador (todas as telas juntas), para acertar onde as bordas se encostam. */
  ownScreen?: () => ScreenSize
  /**
   * Texto copiado que o Deskflow não leva (no GNOME antes do 51, do Linux para o outro PC não vai): `start` avisa
   * cada texto copiado aqui, `write` põe na área de transferência o que veio do outro.
   */
  text?: { start(onCopied: (text: string) => void): void; stop(): void; write(text: string): void }
}

/** Texto copiado vai em uma mensagem só; acima disso fica de fora. */
export const MAX_TEXT_CHARS = 200_000

const normalize = (address: string): string => address.replace(/^::ffff:/i, '')

export function createMouseEngine(deps: MouseEngineDeps): MouseEngine {
  let unadvertise: (() => void) | null = null
  /** Quem pediu para usar o mouse dele aqui e ainda não teve resposta. */
  let pending: Host | null = null
  /** Nome com que o servidor do outro lado espera este PC (o Deskflow recusa nomes desconhecidos). */
  let pendingAs = ''
  /** Os outros lados do compartilhamento em andamento, pelo endereço (aqui servidor: vários; aqui controlado: um). */
  const peers = new Map<string, Host>()
  /** Compartilhamento em que este PC é o servidor: onde cada um fica, para refazer sem encerrar. */
  let serving: { name: string; placements: MousePlacement[] } | null = null
  /** Tamanho da tela que cada computador anunciou na última procura, pelo endereço. */
  const screens = new Map<string, ScreenSize>()
  const requestListeners = new Set<(request: { device: string; address: string }) => void>()
  const endedListeners = new Set<() => void>()

  /** Ligações do Deskflow; sem saber o tamanho daqui, cada um encosta na borda inteira. */
  function linksFor(placements: MousePlacement[]): DeskflowLink[] {
    const own = deps.ownScreen?.()
    return placements.map(({ host, side, offset }) => {
      const screen = host.screen ?? screens.get(host.address)
      return {
        name: host.name,
        side,
        ...(own ? { ranges: edgeRanges(side, own, screen ?? own, offset) } : {})
      }
    })
  }

  function startClipboards(): void {
    const addresses = [...peers.keys()]
    deps.files?.start(addresses)
    deps.text?.start((text) => {
      if (text.length > MAX_TEXT_CHARS) return
      for (const address of peers.keys())
        void deps.channel.send(address, '/mouse/text', { text }).catch(() => undefined)
    })
  }

  function stopClipboards(): void {
    deps.files?.stop()
    deps.text?.stop()
  }

  const notifyEnded = (): void => {
    for (const listener of [...endedListeners]) listener()
  }

  /** Encerra tudo; `tell` avisa os outros lados (quem encerrou do lado de lá não precisa). */
  async function finish(tell: boolean): Promise<void> {
    deps.share.stop()
    stopClipboards()
    const others = [...peers.keys()]
    peers.clear()
    serving = null
    if (tell)
      await Promise.all(
        others.map((address) => deps.channel.send(address, '/mouse/end', {}).catch(() => undefined))
      )
  }

  /** Um dos computadores saiu: segue com os outros; sem ninguém, encerra. */
  async function leave(address: string): Promise<void> {
    if (!serving) return
    peers.delete(address)
    serving.placements = serving.placements.filter((p) => p.host.address !== address)
    if (serving.placements.length === 0) {
      await finish(false)
      notifyEnded()
      return
    }
    await deps.share.share({ name: serving.name, links: linksFor(serving.placements) })
    startClipboards()
  }

  function onMessage(path: string, body: unknown, from: string): boolean {
    const address = normalize(from)
    if (path === '/mouse/request') {
      const device =
        typeof body === 'object' && body !== null
          ? cleanName(String((body as Record<string, unknown>).device ?? ''))
          : ''
      if (!device) return false
      pending = { name: device, address }
      pendingAs = cleanName(String((body as Record<string, unknown>).as ?? ''))
      for (const listener of [...requestListeners]) listener({ device, address })
      return true
    }
    if (path === '/mouse/files') {
      const list =
        typeof body === 'object' && body !== null ? (body as { files?: unknown }).files : null
      const files = Array.isArray(list)
        ? list.filter(
            (file): file is OfferedFile =>
              typeof file === 'object' &&
              file !== null &&
              typeof (file as OfferedFile).id === 'string' &&
              typeof (file as OfferedFile).name === 'string' &&
              Number.isFinite((file as OfferedFile).size)
          )
        : []
      if (files.length === 0 || !peers.has(address)) return false
      void deps.files?.receive(files, address).catch(() => undefined)
      return true
    }
    if (path === '/mouse/text') {
      const text =
        typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : null
      if (typeof text !== 'string' || text.length > MAX_TEXT_CHARS || !peers.has(address))
        return false
      deps.text?.write(text)
      return true
    }
    if (path === '/mouse/end') {
      // Só quem está na conversa pode sair dela: um terceiro na rede não derruba nada.
      if (serving && peers.has(address)) {
        void leave(address).catch(() => undefined)
      } else if (peers.has(address) || pending?.address === address) {
        pending = null
        void finish(false).then(notifyEnded)
      }
      return true
    }
    return false
  }

  deps.share.onEnded(() => {
    void finish(true).then(notifyEnded)
  })

  return {
    async start(name) {
      await deps.channel.listen(onMessage, (path, from) => {
        const id = /^\/mouse\/file\/([\w-]+)$/.exec(path)?.[1]
        return id ? (deps.files?.served(id, normalize(from)) ?? null) : null
      })
      unadvertise?.()
      unadvertise = deps.advertise(name)
    },
    async stop() {
      await finish(true)
      pending = null
      unadvertise?.()
      unadvertise = null
      await deps.channel.close()
    },
    async listPeers() {
      const found = await deps.browse()
      for (const host of found) if (host.screen) screens.set(host.address, host.screen)
      return found
    },
    async share(placements, ownName) {
      if (placements.length === 0) throw new Error('Arraste um computador para perto deste.')
      // O servidor sobe antes dos pedidos: quando cada um aceitar, já há onde se conectar.
      await deps.share.share({ name: ownName, links: linksFor(placements) })
      serving = { name: ownName, placements: [...placements] }
      for (const { host } of placements) peers.set(host.address, host)
      startClipboards()
      const answers = await Promise.all(
        placements.map(({ host }) =>
          deps.channel
            .send(host.address, '/mouse/request', { device: ownName, as: host.name })
            .then(() => true)
            .catch(() => false)
        )
      )
      const silent = placements.filter((_, index) => !answers[index])
      if (silent.length === placements.length) {
        await finish(false)
        throw new Error(
          silent.length === 1
            ? 'O outro computador não respondeu. Confira se o Horizonte está aberto no modo Mouse lá.'
            : 'Nenhum computador respondeu. Confira se o Horizonte está aberto no modo Mouse neles.'
        )
      }
      // Quem não respondeu fica de fora; os outros seguem.
      for (const { host } of silent) await leave(host.address)
    },
    async accept(ownName) {
      const other = pending
      if (!other) throw new Error('O pedido já não está mais valendo.')
      pending = null
      peers.clear()
      peers.set(other.address, other)
      startClipboards()
      // Entra com o nome que o servidor espera: adicionado pelo IP, ele só conhece o endereço.
      await deps.share.follow({ name: pendingAs || ownName, serverAddress: other.address })
    },
    async deny() {
      const other = pending
      pending = null
      if (other) await deps.channel.send(other.address, '/mouse/end', {}).catch(() => undefined)
    },
    async setLayout(placements) {
      if (!serving) return
      // Só muda a posição de quem já está no compartilhamento.
      const current = serving.placements.map(
        (p) => placements.find((next) => next.host.address === p.host.address) ?? p
      )
      serving.placements = current
      await deps.share.share({ name: serving.name, links: linksFor(current) })
    },
    end: () => finish(true),
    onRequest(callback) {
      requestListeners.add(callback)
      return () => requestListeners.delete(callback)
    },
    onEnded(callback) {
      endedListeners.add(callback)
      return () => endedListeners.delete(callback)
    }
  }
}
