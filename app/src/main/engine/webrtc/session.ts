import type { MediaMessage } from '../../../shared/motor'
import { sdpFingerprint } from './fingerprint'
import type { ByeReason, Hello, Message, Want } from './protocol'
import {
  dial,
  listen,
  waitHello,
  type Link,
  type LinkOptions,
  type SignalingServer
} from './signaling'

/** Mensagens que vão e vêm entre as duas janelas do motor, pela sinalização. */
export type { MediaMessage }

const isMedia = (message: Message): message is MediaMessage =>
  message.t === 'offer' || message.t === 'answer' || message.t === 'ice' || message.t === 'bitrate'

/** A parte do motor que roda numa janela (captura, WebRTC, exibição). */
export interface MediaSide {
  /** Começa a sessão; `send` leva as mensagens desta janela ao outro aparelho. */
  start(send: (message: MediaMessage) => void, want: Want): void
  deliver(message: MediaMessage): void
  stop(): void
}

export interface Session {
  readonly peer: Hello
  /** Manda uma mensagem de mídia ao outro lado (o ajuste de bitrate de quem mostra, por exemplo). */
  send(message: MediaMessage): void
  /** Encerra avisando o outro lado. */
  end(reason?: ByeReason): void
  onEnded(callback: (reason: string) => void): () => void
}

/**
 * Liga a sinalização à janela do motor. Toda oferta ou resposta precisa declarar a mesma impressão digital que o
 * outro lado mandou no `hello`: é isso que impede alguém no meio de trocar o certificado.
 */
export function bridge(link: Link, peer: Hello, media: MediaSide, want: Want): Session {
  const endedListeners = new Set<(reason: string) => void>()
  let ended = false

  const finish = (reason: string): void => {
    if (ended) return
    ended = true
    stopMessages()
    stopClose()
    media.stop()
    link.close(reason)
    for (const callback of [...endedListeners]) callback(reason)
  }

  const stopMessages = link.onMessage((message) => {
    if (message.t === 'bye') return finish(message.reason === 'user' ? 'encerrada' : message.reason)
    if (!isMedia(message)) return
    if (message.t === 'offer' || message.t === 'answer') {
      if (sdpFingerprint(message.sdp) !== peer.fp) {
        link.send({ t: 'bye', reason: 'error' })
        return finish('certificado diferente')
      }
    }
    media.deliver(message)
  })
  const stopClose = link.onClose((reason) => finish(reason))

  media.start((message) => link.send(message), want)

  return {
    peer,
    send(message) {
      if (!ended) link.send(message)
    },
    end(reason = 'user') {
      if (ended) return
      link.send({ t: 'bye', reason })
      finish('encerrada')
    },
    onEnded(callback) {
      if (ended) {
        callback('encerrada')
        return () => undefined
      }
      endedListeners.add(callback)
      return () => endedListeners.delete(callback)
    }
  }
}

export interface SenderOptions extends LinkOptions {
  port?: number
  host?: string
  hello(): Hello
  /** Decide se este aparelho pode ver a tela. `true`: aceito; `false`: recusado pela pessoa. */
  approve(peer: Hello, address: string, cancelled: Promise<void>): Promise<boolean>
  /** Liga a janela de transmissão a uma sessão nova com este aparelho. */
  media(peer: Hello): MediaSide
  onSession(session: Session, address: string): void
  onError?(error: Error): void
  helloTimeoutMs?: number
}

export interface Sender {
  readonly port: number
  stop(): Promise<void>
}

/** Lado que envia: escuta, pede aprovação, e atende uma sessão por vez. */
export async function startSender(options: SenderOptions): Promise<Sender> {
  let busy = false
  let current: Session | null = null
  const server: SignalingServer = await listen({
    ...options,
    onLink(link, peer) {
      if (busy) {
        link.send({ t: 'denied', reason: 'busy' })
        link.close('ocupado')
        return
      }
      busy = true
      void serve(link, peer).finally(() => {
        if (!current) busy = false
      })
    }
  })

  async function serve(link: Link, peer: Hello): Promise<void> {
    const cancelled = new Promise<void>((resolve) => {
      link.onMessage((message) => message.t === 'cancel' && resolve())
      link.onClose(() => resolve())
    })
    link.send({ t: 'pending' })
    const approved = await Promise.race([
      options.approve(peer, link.remoteAddress, cancelled),
      cancelled.then(() => null)
    ])
    if (approved === null || link.closed) return link.close('desistiu')
    if (!approved) {
      link.send({ t: 'denied', reason: 'user' })
      return link.close('recusado')
    }
    link.send({ t: 'accepted', trusted: false })
    // A sessão nasce dentro do aviso do `want`: o que vier logo atrás dele na mesma leitura já a encontra ligada.
    const session = await new Promise<Session | null>((resolve) => {
      const stop = link.onMessage((message) => {
        if (message.t !== 'want') return
        stop()
        resolve(bridge(link, peer, options.media(peer), message))
      })
      link.onClose(() => resolve(null))
    })
    if (!session) return
    current = session
    session.onEnded(() => {
      current = null
      busy = false
    })
    options.onSession(session, link.remoteAddress)
  }

  return {
    port: server.port,
    async stop() {
      current?.end('quit')
      await server.close()
    }
  }
}

export interface ConnectOptions extends LinkOptions {
  host: string
  port: number
  hello: Hello
  want: Want
  media(): MediaSide
  /** O outro lado está perguntando à pessoa se pode. */
  onPending?(peer: Hello): void
  /** Tempo para a pessoa do outro lado aprovar. */
  approvalTimeoutMs?: number
  helloTimeoutMs?: number
  signal?: AbortSignal
}

const DENIED: Record<string, string> = {
  user: 'O outro aparelho não permitiu a conexão.',
  busy: 'O outro aparelho já está mostrando a tela em outro lugar.',
  version: 'Os dois aparelhos estão com versões diferentes do Horizonte. Atualize os dois.'
}

/** Lado que mostra: conecta, espera a aprovação e começa a sessão. */
export async function connect(options: ConnectOptions): Promise<Session> {
  const link = await dial(options.host, options.port, options)
  const abort = (): void => {
    link.send({ t: 'cancel' })
    link.close('cancelado')
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    link.send(options.hello)
    const peer = await waitHello(link, options.helloTimeoutMs ?? 10_000)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        link.send({ t: 'cancel' })
        link.close('sem resposta')
        reject(new Error('O outro aparelho não respondeu ao pedido a tempo.'))
      }, options.approvalTimeoutMs ?? 120_000)
      const done = (): void => {
        clearTimeout(timer)
        stopMessage()
        stopClose()
      }
      const stopMessage = link.onMessage((message) => {
        if (message.t === 'pending') return options.onPending?.(peer)
        if (message.t === 'accepted') {
          done()
          return resolve()
        }
        if (message.t === 'denied') {
          done()
          link.close('recusado')
          return reject(new Error(DENIED[message.reason]))
        }
      })
      const stopClose = link.onClose(() => {
        done()
        reject(
          new Error(options.signal?.aborted ? 'Cancelado.' : 'O outro aparelho fechou a conexão.')
        )
      })
    })
    link.send(options.want)
    return bridge(link, peer, options.media(), options.want)
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
