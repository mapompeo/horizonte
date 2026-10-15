import type { Host } from '../../../shared/types'
import { cleanName } from '../../../shared/names'
import type { MouseEngine } from '../port'
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
}

const normalize = (address: string): string => address.replace(/^::ffff:/i, '')

export function createMouseEngine(deps: MouseEngineDeps): MouseEngine {
  let unadvertise: (() => void) | null = null
  /** Quem pediu para usar o mouse dele aqui e ainda não teve resposta. */
  let pending: Host | null = null
  /** Nome com que o servidor do outro lado espera este PC (o Deskflow recusa nomes desconhecidos). */
  let pendingAs = ''
  /** O outro lado do compartilhamento em andamento. */
  let peer: Host | null = null
  const requestListeners = new Set<(request: { device: string; address: string }) => void>()
  const endedListeners = new Set<() => void>()

  const notifyEnded = (): void => {
    for (const listener of [...endedListeners]) listener()
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
      if (files.length === 0 || peer?.address !== address) return false
      void deps.files?.receive(files, address).catch(() => undefined)
      return true
    }
    if (path === '/mouse/end') {
      // Só o outro lado da conversa pode encerrar: um terceiro na rede não derruba nada.
      if (peer?.address === address || pending?.address === address) {
        const wasActive = peer !== null || pending !== null
        deps.share.stop()
        deps.files?.stop()
        peer = null
        pending = null
        if (wasActive) notifyEnded()
      }
      return true
    }
    return false
  }

  deps.share.onEnded(() => {
    deps.files?.stop()
    const other = peer
    peer = null
    if (other) void deps.channel.send(other.address, '/mouse/end', {}).catch(() => undefined)
    notifyEnded()
  })

  async function end(): Promise<void> {
    deps.share.stop()
    deps.files?.stop()
    const other = peer
    peer = null
    if (other) await deps.channel.send(other.address, '/mouse/end', {}).catch(() => undefined)
  }

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
      await end()
      pending = null
      unadvertise?.()
      unadvertise = null
      await deps.channel.close()
    },
    listPeers: () => deps.browse(),
    async share(other, ownName) {
      // O servidor sobe antes do pedido: quando o outro aceitar, já há onde se conectar.
      await deps.share.share({ name: ownName, peerName: other.name, side: 'right' })
      peer = other
      deps.files?.start(other.address)
      try {
        await deps.channel.send(other.address, '/mouse/request', {
          device: ownName,
          as: other.name
        })
      } catch {
        await end()
        throw new Error(
          'O outro computador não respondeu. Confira se o Horizonte está aberto no modo Mouse lá.'
        )
      }
    },
    async accept(ownName) {
      const other = pending
      if (!other) throw new Error('O pedido já não está mais valendo.')
      pending = null
      peer = other
      deps.files?.start(other.address)
      // Entra com o nome que o servidor espera: adicionado pelo IP, ele só conhece o endereço.
      await deps.share.follow({ name: pendingAs || ownName, serverAddress: other.address })
    },
    async deny() {
      const other = pending
      pending = null
      if (other) await deps.channel.send(other.address, '/mouse/end', {}).catch(() => undefined)
    },
    end,
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
