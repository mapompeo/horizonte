import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type Socket } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import type { WebAccess } from '../../shared/types'
import { MAX_LINE_BYTES, parseMessage } from '../engine/webrtc/protocol'

/**
 * Receber pelo navegador (motor próprio): quem envia serve a página do receptor e liga cada navegador à sinalização
 * deste próprio aparelho, como se fosse mais um aparelho da rede. O resto não muda: o pedido "Permitir?", a
 * confiança pela impressão digital e o WebRTC são os mesmos dos aparelhos com o app.
 *
 * O navegador não abre TCP, então a sinalização vai por HTTP: `POST /api/abrir` com o código de 6 dígitos mostrado
 * no app devolve uma sessão; `GET /api/eventos` (Server-Sent Events) traz as mensagens; `POST /api/enviar` leva as
 * mensagens, uma por pedido, conferidas pelo mesmo `parseMessage` da sinalização.
 */

/**
 * Porta da página: a primeira livre de 47920 a 47929, fora da faixa da sinalização (47910 a 47919). Ela fica dentro da
 * faixa que o Linux sorteia para conexões de saída, então outro programa pode estar usando a primeira (visto com o
 * Spotify): por isso a faixa, e o app mostra a porta que pegou.
 */
export const BROWSER_PORT = 47920
export const BROWSER_PORT_LAST = 47929
/** Tentativas erradas do código antes de travar por um minuto. */
const MAX_WRONG = 5
const LOCK_MS = 60_000
/** Sessões abertas e ainda sem eventos somem depois disto. */
const IDLE_MS = 30_000
const KEEPALIVE_MS = 15_000

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

export interface BrowserBridgeOptions {
  /** Pasta da página do receptor (a saída do Vite, com `web.html` e `assets/`). */
  pagesDir: string
  /** Porta da sinalização deste aparelho, quando ele está esperando conexão. */
  signalingPort(): number | null
  port?: number
  host?: string
  /** Gera o código; nos testes, fixo. */
  generateCode?(): string
  now?(): number
}

export interface BrowserBridge {
  readonly port: number
  readonly code: string
  stop(): Promise<void>
}

interface Tunnel {
  socket: Socket
  events: ServerResponse | null
  /** Mensagens que chegaram antes de o navegador abrir os eventos. */
  backlog: string[]
  idle: ReturnType<typeof setTimeout>
}

const sixDigits = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

function sameCode(given: unknown, code: string): boolean {
  if (typeof given !== 'string' || !/^\d{6}$/.test(given)) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(code))
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function reply(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

export async function startBrowserBridge(options: BrowserBridgeOptions): Promise<BrowserBridge> {
  const code = (options.generateCode ?? sixDigits)()
  const now = options.now ?? Date.now
  const tunnels = new Map<string, Tunnel>()
  let wrong = 0
  let lockedUntil = 0

  const close = (id: string): void => {
    const tunnel = tunnels.get(id)
    if (!tunnel) return
    tunnels.delete(id)
    clearTimeout(tunnel.idle)
    tunnel.socket.destroy()
    tunnel.events?.end()
  }

  function push(tunnel: Tunnel, line: string): void {
    if (tunnel.events) tunnel.events.write(`data: ${line}\n\n`)
    else tunnel.backlog.push(line)
  }

  async function open(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (now() < lockedUntil)
      return reply(res, 429, { erro: 'Muitas tentativas. Espere um minuto.' })
    const body = await readBody(req, 256)
    let given: unknown
    try {
      given = body ? (JSON.parse(body) as { codigo?: unknown }).codigo : undefined
    } catch {
      given = undefined
    }
    if (!sameCode(given, code)) {
      wrong++
      if (wrong >= MAX_WRONG) {
        wrong = 0
        lockedUntil = now() + LOCK_MS
      }
      return reply(res, 403, { erro: 'Código errado.' })
    }
    wrong = 0
    const port = options.signalingPort()
    if (port === null)
      return reply(res, 409, {
        erro: 'O computador não está esperando conexão. Escolha Enviar nele.'
      })

    const id = randomBytes(16).toString('hex')
    const socket = connect({ host: '127.0.0.1', port })
    const tunnel: Tunnel = {
      socket,
      events: null,
      backlog: [],
      idle: setTimeout(() => close(id), IDLE_MS)
    }
    tunnels.set(id, tunnel)
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      pending += chunk
      if (pending.length > MAX_LINE_BYTES * 4) return close(id)
      let at: number
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at)
        pending = pending.slice(at + 1)
        if (line) push(tunnel, line)
      }
    })
    socket.on('error', () => close(id))
    socket.on('close', () => {
      if (tunnel.events) tunnel.events.write('event: fim\ndata: {}\n\n')
      close(id)
    })
    reply(res, 200, { sessao: id })
  }

  function events(id: string, res: ServerResponse): void {
    const tunnel = tunnels.get(id)
    if (!tunnel || tunnel.events) return reply(res, 404)
    clearTimeout(tunnel.idle)
    tunnel.events = res
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive'
    })
    res.write(': conectado\n\n')
    for (const line of tunnel.backlog.splice(0)) res.write(`data: ${line}\n\n`)
    const keepalive = setInterval(() => res.write(': ainda aqui\n\n'), KEEPALIVE_MS)
    res.on('close', () => {
      clearInterval(keepalive)
      close(id)
    })
  }

  async function send(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const tunnel = tunnels.get(id)
    if (!tunnel) return reply(res, 404)
    const body = await readBody(req, MAX_LINE_BYTES)
    const message = body ? parseMessage(body) : null
    if (!message) return reply(res, 400, { erro: 'Mensagem fora do formato.' })
    tunnel.socket.write(JSON.stringify(message) + '\n')
    reply(res, 204)
  }

  async function page(path: string, res: ServerResponse): Promise<void> {
    const relative = path === '/' ? 'web.html' : normalize(path.slice(1))
    const allowed =
      relative === 'web.html' ||
      (relative.startsWith(`assets${sep}`) &&
        !relative.includes('..') &&
        extname(relative) in TYPES)
    if (!allowed) return reply(res, 404)
    try {
      const data = await readFile(join(options.pagesDir, relative))
      res.writeHead(200, {
        'content-type': TYPES[extname(relative)] ?? 'application/octet-stream',
        'cache-control': relative === 'web.html' ? 'no-store' : 'max-age=3600',
        // A página só fala com este mesmo endereço.
        'content-security-policy':
          "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'",
        'x-content-type-options': 'nosniff'
      })
      res.end(data)
    } catch {
      reply(res, 404)
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://horizonte')
    const id = url.searchParams.get('sessao') ?? ''
    const route = `${req.method} ${url.pathname}`
    const done = (promise: Promise<void>): void => {
      promise.catch(() => {
        if (!res.headersSent) reply(res, 500)
        else res.end()
      })
    }
    if (route === 'POST /api/abrir') return done(open(req, res))
    if (route === 'GET /api/eventos') return events(id, res)
    if (route === 'POST /api/enviar') return done(send(id, req, res))
    if (route === 'POST /api/fechar') {
      close(id)
      return reply(res, 204)
    }
    if (req.method === 'GET') return done(page(url.pathname, res))
    reply(res, 404)
  })

  const listenOn = (candidate: number): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const fail = (error: Error): void => reject(error)
      server.once('error', fail)
      server.listen(candidate, options.host, () => {
        server.off('error', fail)
        const address = server.address()
        resolve(typeof address === 'object' && address ? address.port : candidate)
      })
    })
  const candidates =
    options.port !== undefined
      ? [options.port]
      : Array.from({ length: BROWSER_PORT_LAST - BROWSER_PORT + 1 }, (_, i) => BROWSER_PORT + i)
  let port = 0
  for (const [i, candidate] of candidates.entries()) {
    try {
      port = await listenOn(candidate)
      break
    } catch (error) {
      const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      if (!busy || i === candidates.length - 1) throw error
    }
  }

  return {
    port,
    code,
    async stop() {
      for (const id of [...tunnels.keys()]) close(id)
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

/** O botão "Receber pelo navegador" da tela Pronto, no motor próprio: liga e desliga a página. */
export function createBrowserAccess(options: {
  pagesDir: string
  signalingPort(): number | null
  lanAddress(): string | undefined
  start?: typeof startBrowserBridge
}): { status(): Promise<WebAccess>; start(): Promise<WebAccess>; stop(): Promise<void> } {
  let bridge: BrowserBridge | null = null
  const status = async (): Promise<WebAccess> => {
    if (!bridge) return { on: false }
    const address = options.lanAddress()
    return {
      on: true,
      code: bridge.code,
      ...(address ? { url: `http://${address}:${bridge.port}` } : {})
    }
  }
  return {
    status,
    async start() {
      try {
        bridge ??= await (options.start ?? startBrowserBridge)({
          pagesDir: options.pagesDir,
          signalingPort: options.signalingPort
        })
        return status()
      } catch (error) {
        const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
        return {
          on: false,
          error: busy
            ? `As portas ${BROWSER_PORT} a ${BROWSER_PORT_LAST} estão em uso por outros programas.`
            : 'Não consegui abrir a página para o navegador.'
        }
      }
    },
    async stop() {
      const current = bridge
      bridge = null
      await current?.stop()
    }
  }
}
