import { connect, createServer, type Server, type Socket } from 'node:net'
import {
  encodeMessage,
  MAX_LINE_BYTES,
  parseMessage,
  PROTOCOL_VERSION,
  SIGNALING_PORT,
  SIGNALING_PORT_LAST,
  type Hello,
  type Message
} from './protocol'

/** Uma conexão de sinalização: mensagens JSON, uma por linha, com ping para notar quando o outro lado sumiu. */
export interface Link {
  readonly remoteAddress: string
  send(message: Message): void
  onMessage(callback: (message: Message) => void): () => void
  /** Chamado uma vez, quando a conexão termina por qualquer motivo. */
  onClose(callback: (reason: string) => void): () => void
  close(reason?: string): void
  readonly closed: boolean
}

export interface LinkOptions {
  /** Intervalo do ping; 0 desliga. */
  pingMs?: number
  /** Quantos pings sem resposta derrubam a conexão. */
  maxMissed?: number
  now?: () => number
}

const normalizeAddress = (address: string | undefined): string =>
  (address ?? '').replace(/^::ffff:/i, '')

/** Põe o protocolo de linhas em cima de um socket TCP. Linha inválida ou grande demais encerra a conexão. */
export function wrapSocket(socket: Socket, options: LinkOptions = {}): Link {
  const pingMs = options.pingMs ?? 5000
  const maxMissed = options.maxMissed ?? 3
  const now = options.now ?? Date.now
  const messageListeners = new Set<(message: Message) => void>()
  const closeListeners = new Set<(reason: string) => void>()
  // Mensagens que chegaram enquanto ninguém escutava (entre o `hello` e quem assume a conexão).
  const queued: Message[] = []
  let buffer = ''
  let closed = false
  let missed = 0
  let closeReason = 'fechada'

  socket.setEncoding('utf8')
  socket.setNoDelay(true)

  const finish = (reason: string): void => {
    if (closed) return
    closed = true
    closeReason = reason
    clearInterval(timer)
    socket.destroy()
    for (const callback of [...closeListeners]) callback(closeReason)
  }

  const send = (message: Message): void => {
    if (closed) return
    socket.write(encodeMessage(message))
  }

  const deliver = (message: Message): void => {
    if (messageListeners.size === 0) {
      if (queued.length >= 64) return finish('mensagens demais')
      queued.push(message)
      return
    }
    for (const callback of [...messageListeners]) callback(message)
  }

  const timer =
    pingMs > 0
      ? setInterval(() => {
          if (missed >= maxMissed) return finish('sem resposta')
          missed += 1
          send({ t: 'ping', at: now() })
        }, pingMs)
      : undefined
  timer?.unref?.()

  socket.on('data', (chunk: string) => {
    buffer += chunk
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES && !buffer.includes('\n'))
      return finish('mensagem grande demais')
    let newline = buffer.indexOf('\n')
    while (newline !== -1 && !closed) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return finish('mensagem grande demais')
      const message = parseMessage(line)
      if (!message) return finish('mensagem inválida')
      missed = 0
      if (message.t === 'ping') send({ t: 'pong', at: message.at })
      else if (message.t !== 'pong') deliver(message)
      newline = buffer.indexOf('\n')
    }
  })
  socket.on('error', (error) => finish(error.message))
  socket.on('close', () => finish('fechada pelo outro lado'))

  return {
    remoteAddress: normalizeAddress(socket.remoteAddress),
    send,
    onMessage(callback) {
      messageListeners.add(callback)
      if (queued.length > 0)
        queueMicrotask(() => {
          while (queued.length > 0 && messageListeners.size > 0 && !closed)
            deliver(queued.shift() as Message)
        })
      return () => messageListeners.delete(callback)
    },
    onClose(callback) {
      if (closed) {
        callback(closeReason)
        return () => undefined
      }
      closeListeners.add(callback)
      return () => closeListeners.delete(callback)
    },
    close(reason = 'encerrada') {
      if (closed) return
      // Deixa a última mensagem (um `bye`, por exemplo) sair antes de fechar.
      socket.end(() => finish(reason))
      setTimeout(() => finish(reason), 1000).unref?.()
    },
    get closed() {
      return closed
    }
  }
}

/** Espera a primeira mensagem, que precisa ser um `hello`. */
export function waitHello(link: Link, timeoutMs: number): Promise<Hello> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      done()
      link.close('sem hello')
      reject(new Error('O outro aparelho não se apresentou a tempo.'))
    }, timeoutMs)
    const stopMessage = link.onMessage((message) => {
      done()
      if (message.t === 'hello') return resolve(message)
      link.close('esperava hello')
      reject(new Error('O outro aparelho não seguiu o protocolo do Horizonte.'))
    })
    const stopClose = link.onClose(() => {
      done()
      reject(new Error('O outro aparelho fechou a conexão.'))
    })
    function done(): void {
      clearTimeout(timer)
      stopMessage()
      stopClose()
    }
  })
}

export interface SignalingServer {
  readonly port: number
  close(): Promise<void>
}

export interface ListenOptions extends LinkOptions {
  /** Porta fixa; sem ela, a primeira livre entre `SIGNALING_PORT` e `SIGNALING_PORT_LAST`. */
  port?: number
  host?: string
  maxConnections?: number
  helloTimeoutMs?: number
  /** Só o nosso `hello`, sem `screen`: é a resposta ao `hello` de quem conectou. */
  hello(): Hello
  /** Uma conexão com `hello` válido e da mesma versão. Quem recebe decide se aceita. */
  onLink(link: Link, peer: Hello): void
  onError?(error: Error): void
}

function listenOn(server: Server, port: number, host: string | undefined): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

/** Abre o servidor de sinalização de quem envia. */
export async function listen(options: ListenOptions): Promise<SignalingServer> {
  const maxConnections = options.maxConnections ?? 4
  const helloTimeoutMs = options.helloTimeoutMs ?? 30_000
  const links = new Set<Link>()
  const server = createServer((socket) => {
    if (links.size >= maxConnections) {
      socket.destroy()
      return
    }
    const link = wrapSocket(socket, options)
    links.add(link)
    link.onClose(() => links.delete(link))
    waitHello(link, helloTimeoutMs).then(
      (peer) => {
        if (peer.v !== PROTOCOL_VERSION) {
          link.send(options.hello())
          link.send({ t: 'denied', reason: 'version' })
          link.close('versão diferente')
          return
        }
        link.send(options.hello())
        options.onLink(link, peer)
      },
      (error: Error) => options.onError?.(error)
    )
  })
  server.on('error', (error) => options.onError?.(error))

  let port: number | null = null
  const candidates =
    options.port !== undefined
      ? [options.port]
      : Array.from(
          { length: SIGNALING_PORT_LAST - SIGNALING_PORT + 1 },
          (_, i) => SIGNALING_PORT + i
        )
  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      port = await listenOn(server, candidate, options.host)
      break
    } catch (error) {
      lastError = error
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') break
    }
  }
  if (port === null) {
    server.close()
    throw new Error('Não consegui abrir a porta da conexão. Outro programa pode estar usando.', {
      cause: lastError
    })
  }

  return {
    port,
    close: () =>
      new Promise((resolve) => {
        for (const link of links) link.close('servidor fechado')
        server.close(() => resolve())
      })
  }
}

export interface DialOptions extends LinkOptions {
  timeoutMs?: number
}

/** Conecta a quem envia. */
export function dial(host: string, port: number, options: DialOptions = {}): Promise<Link> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`${host} não respondeu.`))
    }, options.timeoutMs ?? 10_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.removeAllListeners('error')
      resolve(wrapSocket(socket, options))
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        new Error(
          error.code === 'ECONNREFUSED'
            ? `${host} não está esperando conexão. Escolha Enviar no outro aparelho.`
            : `Não consegui falar com ${host}.`,
          { cause: error }
        )
      )
    })
  })
}
