import { randomBytes } from 'node:crypto'
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
 * O navegador não abre TCP, então a sinalização vai por HTTP: `POST /api/abrir` devolve uma sessão (quem decide é o
 * Permitir no computador); `GET /api/eventos` (Server-Sent Events) traz as mensagens; `POST /api/enviar` leva as
 * mensagens, uma por pedido, conferidas pelo mesmo `parseMessage` da sinalização.
 */

/**
 * Porta da página: a primeira livre de 7777 a 7786. Curta e repetida, para digitar de cabeça, e abaixo da faixa que o
 * Linux sorteia para conexões de saída (a 47920 já foi pega pelo Spotify assim). Se outro programa estiver nela, vai a
 * próxima, e o app mostra a porta que pegou.
 */
export const BROWSER_PORT = 7777
export const BROWSER_PORT_LAST = 7786
/** Adicionada à tela de início do celular, a página abre como app: tela inteira, deitada, sem as barras do navegador. */
const MANIFEST = {
  name: 'Horizonte',
  short_name: 'Horizonte',
  start_url: '/',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#000000',
  theme_color: '#000000'
}

/** O link da página que a janela pode mandar compartilhar: http, IPv4 da rede e uma porta, nada mais. */
export const isLocalPageUrl = (url: unknown): url is string =>
  typeof url === 'string' && /^http:\/\/\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(url)

/** Sessões abertas ao mesmo tempo: cada uma prende uma conexão com a sinalização. */
const MAX_TUNNELS = 8
/** Sessões abertas e ainda sem eventos somem depois disto. */
const IDLE_MS = 30_000
const KEEPALIVE_MS = 15_000
/** Maior linha que a sinalização deste aparelho manda ao navegador (uma imagem do modo compatível). */
const MAX_FROM_HERE = 8 * 1024 * 1024

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
}

export interface BrowserBridge {
  readonly port: number
  stop(): Promise<void>
}

interface Tunnel {
  socket: Socket
  events: ServerResponse | null
  /** Mensagens que chegaram antes de o navegador abrir os eventos. */
  backlog: string[]
  idle: ReturnType<typeof setTimeout>
  /** A imagem mais recente do modo compatível, já em binário, e o número dela. */
  frame: Buffer | null
  frameNo: number
  /** A resposta MJPEG aberta (`GET /api/video`), se o navegador usa esse jeito. */
  video: ServerResponse | null
  /** Número da última imagem que já foi para a resposta MJPEG. */
  videoNo: number
}

const BOUNDARY = 'horizonte-quadro'

const JPEG_LINE = '{"t":"jpeg","data":"data:image/jpeg;base64,'

/**
 * Modo compatível: a imagem não vai ao navegador dentro do evento (base64 em JSON, pesado de ler num iPad antigo).
 * A ponte guarda os bytes e o evento só diz o número; o navegador carrega a imagem por `GET /api/quadro`, direto
 * numa `<img>`, como qualquer foto.
 */
function takeFrame(tunnel: Tunnel, line: string): string | null {
  if (!line.startsWith(JPEG_LINE) || !line.endsWith('"}')) return null
  tunnel.frame = Buffer.from(line.slice(JPEG_LINE.length, -2), 'base64')
  tunnel.frameNo++
  return JSON.stringify({ t: 'quadro', n: tunnel.frameNo })
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
  const tunnels = new Map<string, Tunnel>()

  const close = (id: string): void => {
    const tunnel = tunnels.get(id)
    if (!tunnel) return
    tunnels.delete(id)
    clearTimeout(tunnel.idle)
    tunnel.socket.destroy()
    tunnel.events?.end()
    tunnel.video?.end()
  }

  /**
   * MJPEG (como as câmeras IP): uma resposta só, com uma imagem atrás da outra, que a `<img>` mostra sozinha, sem
   * JavaScript nem um pedido por imagem. O ritmo é o da rede: a próxima só é pedida ao computador (`more`) depois que
   * a anterior saiu daqui; um aparelho lento recebe menos imagens em vez de acumular atraso.
   */
  function writeVideo(tunnel: Tunnel): void {
    const video = tunnel.video
    const frame = tunnel.frame
    if (!video || !frame || tunnel.videoNo === tunnel.frameNo) return
    tunnel.videoNo = tunnel.frameNo
    video.write(
      `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
    )
    video.write(frame)
    const more = (): void => {
      if (tunnel.video === video) tunnel.socket.write('{"t":"more"}\n')
    }
    if (video.write('\r\n')) more()
    else video.once('drain', more)
  }

  function startVideo(id: string, res: ServerResponse): void {
    const tunnel = tunnels.get(id)
    if (!tunnel || tunnel.video) return reply(res, 404)
    tunnel.video = res
    tunnel.videoNo = 0
    res.writeHead(200, {
      'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      'cache-control': 'no-store'
    })
    // O cabeçalho sai já, antes da primeira imagem: o navegador não fica esperando a resposta começar.
    res.flushHeaders()
    res.on('close', () => {
      if (tunnel.video === res) tunnel.video = null
    })
    writeVideo(tunnel)
  }

  function push(tunnel: Tunnel, line: string): void {
    if (tunnel.events) tunnel.events.write(`data: ${line}\n\n`)
    else tunnel.backlog.push(line)
  }

  // Sem código: quem decide é o Permitir no computador, que aparece a cada pedido.
  async function open(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (tunnels.size >= MAX_TUNNELS)
      return reply(res, 429, { erro: 'O computador está ocupado. Tente daqui a pouco.' })
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
      idle: setTimeout(() => close(id), IDLE_MS),
      frame: null,
      frameNo: 0,
      video: null,
      videoNo: 0
    }
    tunnels.set(id, tunnel)
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      pending += chunk
      // Daqui vem só o que este próprio computador manda; as imagens do modo compatível passam de 64 KiB.
      if (pending.length > MAX_FROM_HERE) return close(id)
      let at: number
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at)
        pending = pending.slice(at + 1)
        if (!line) continue
        const notice = takeFrame(tunnel, line)
        if (!notice) push(tunnel, line)
        else if (tunnel.video) writeVideo(tunnel)
        else push(tunnel, notice)
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
    // "/8775": links de versões antigas (com o código no fim) ainda abrem a página.
    const relative = path === '/' || /^\/\d{4}$/.test(path) ? 'web.html' : normalize(path.slice(1))
    const allowed =
      relative === 'web.html' ||
      relative === 'legado.js' ||
      (relative.startsWith(`assets${sep}`) &&
        !relative.includes('..') &&
        extname(relative) in TYPES)
    if (!allowed) return reply(res, 404)
    try {
      const data = await readFile(join(options.pagesDir, relative))
      res.writeHead(200, {
        'content-type': TYPES[extname(relative)] ?? 'application/octet-stream',
        // A página e o modo compatível (legado.js, sem nome com hash) nunca ficam guardados: uma versão velha no
        // cache do aparelho seguia rodando depois de atualizar o app. Os arquivos de assets/ têm o hash no nome.
        'cache-control':
          relative === 'web.html' || relative === 'legado.js' ? 'no-store' : 'max-age=3600',
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
    if (route === 'GET /api/video') return startVideo(id, res)
    if (route === 'GET /api/quadro') {
      // Pediu uma imagem avulsa: o navegador não mostra o MJPEG. Larga a resposta MJPEG (o Safari antigo pode deixá-la
      // aberta) para os avisos de imagem nova voltarem a ir pelos eventos.
      const tunnel = tunnels.get(id)
      if (tunnel?.video) {
        const video = tunnel.video
        tunnel.video = null
        video.end()
      }
      const frame = tunnel?.frame
      if (!frame) return reply(res, 404)
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': frame.length,
        'cache-control': 'no-store'
      })
      return void res.end(frame)
    }
    if (route === 'POST /api/fechar') {
      close(id)
      return reply(res, 204)
    }
    if (route === 'GET /manifest.webmanifest') {
      res.writeHead(200, {
        'content-type': 'application/manifest+json; charset=utf-8',
        'cache-control': 'no-store'
      })
      return void res.end(JSON.stringify(MANIFEST))
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
      } catch {
        // A janela mostra o título e o que fazer, no idioma da pessoa, pelo código.
        return { on: false, error: 'HZ-105' }
      }
    },
    async stop() {
      const current = bridge
      bridge = null
      await current?.stop()
    }
  }
}
