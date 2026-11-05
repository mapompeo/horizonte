import type { Socket } from 'node:net'
import type { ScreenSize } from '../../../shared/types'
import type { DeskflowLink } from '../deskflow/config'
import type { MouseShare } from '../deskflow/session'
import {
  barrierFor,
  crossedBack,
  entryPoint,
  returnPoint,
  type Barrier,
  type Point,
  type Zone
} from './geometry'
import { secureLink, type SecureLink } from './secure-link'

/** Porta do modo Mouse sem Deskflow (ao lado do canal, 47901). */
export const NATIVE_MOUSE_PORT = 47902
const PING_MS = 1000
/** Sem resposta por este tempo, o outro computador sumiu: o mouse volta para cá na hora. */
const SILENCE_MS = 3000
const CONNECT_TRIES = 8
const CONNECT_WAIT_MS = 500

/** O auxiliar `horizonte-mouse` (linhas na entrada e na saída padrão). */
export interface LineProcess {
  send(line: string): void
  onLine(listener: (line: string) => void): void
  onExit(listener: () => void): void
  kill(): void
}

export interface NativeShareDeps {
  spawn(mode: 'capture' | 'inject'): LineProcess
  /** Escuta os computadores que aceitaram; devolve como parar. */
  listen(onSocket: (socket: Socket, address: string) => void): Promise<() => void>
  connect(address: string): Promise<Socket>
  sleep(ms: number): Promise<void>
  log?(message: string): void
}

type Wire =
  | { t: 'enter'; x: number; y: number }
  | { t: 'leave' }
  | { t: 'move'; dx: number; dy: number }
  | { t: 'button' | 'key'; code: number; down: boolean }
  | { t: 'wheel' | 'scroll'; dx: number; dy: number }
  | { t: 'ping' }
  | { t: 'pong' }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e7

/**
 * A linha para o auxiliar de quem é controlado. O que vem da rede só vira comando depois de conferido: nada de texto
 * livre chega à entrada do auxiliar.
 */
export function injectLine(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (m.t === 'enter') return finite(m.x) && finite(m.y) ? `warp ${m.x} ${m.y}\n` : null
  if (m.t === 'move' || m.t === 'scroll' || m.t === 'wheel') {
    if (!finite(m.dx) || !finite(m.dy)) return null
    if (m.t === 'wheel') return `wheel ${Math.trunc(m.dx)} ${Math.trunc(m.dy)}\n`
    return `${m.t} ${m.dx} ${m.dy}\n`
  }
  if (m.t === 'button' || m.t === 'key') {
    if (!Number.isInteger(m.code) || typeof m.down !== 'boolean') return null
    return `${m.t} ${m.code} ${m.down ? 1 : 0}\n`
  }
  return null
}

interface Peer {
  link: DeskflowLink
  barrier: Barrier | null
  conn: SecureLink | null
  lastSeen: number
}

export function createNativeMouseShare(deps: NativeShareDeps, now = Date.now): MouseShare {
  const ended = new Set<() => void>()
  let capture: LineProcess | null = null
  let inject: LineProcess | null = null
  let stopListening: (() => void) | null = null
  let client: SecureLink | null = null
  let peers: Peer[] = []
  let zones: Zone[] = []
  let collecting: Zone[] = []
  let zonesReady: (() => void) | null = null
  let token = ''
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let stopping = false

  /** Com quem o cursor está agora. */
  let active: { peer: Peer; position: Point; screen: ScreenSize } | null = null
  const buttons = new Set<number>()
  const keys = new Set<number>()

  const notifyEnded = (): void => {
    if (stopping) return
    for (const listener of [...ended]) listener()
  }

  function applyBarriers(): void {
    if (!capture) return
    capture.send('clear\n')
    peers.forEach((peer, id) => {
      peer.barrier = barrierFor(peer.link.side, zones, peer.link.ranges)
      const b = peer.barrier
      if (b) capture?.send(`barrier ${id} ${b.x1} ${b.y1} ${b.x2} ${b.y2}\n`)
    })
    capture.send('apply\n')
  }

  /** Solta o que estava apertado lá e devolve o cursor aqui. */
  function comeBack(at: Point): void {
    const current = active
    active = null
    if (current?.peer.conn) {
      for (const code of buttons) current.peer.conn.send({ t: 'button', code, down: false })
      for (const code of keys) current.peer.conn.send({ t: 'key', code, down: false })
      current.peer.conn.send({ t: 'leave' })
    }
    buttons.clear()
    keys.clear()
    capture?.send(`release ${at.x} ${at.y}\n`)
  }

  function returnHere(): void {
    if (!active?.peer.barrier) return comeBack({ x: 0, y: 0 })
    const { peer, position, screen } = active
    comeBack(
      returnPoint(peer.link.side, peer.barrier as Barrier, position, screen, peer.link.ranges)
    )
  }

  function onEnter(id: number, at: Point): void {
    const peer = peers[id]
    if (!peer?.barrier) return comeBack(at)
    const screen = peer.link.screen
    const barrier = peer.barrier
    if (!peer.conn || !screen) {
      // Ainda não conectou (ou caiu): o cursor não some, fica aqui.
      active = { peer, position: { x: 0, y: 0 }, screen: screen ?? { width: 1, height: 1 } }
      const entry = entryPoint(peer.link.side, barrier, at, active.screen, peer.link.ranges)
      active.position = entry
      return comeBack(returnPoint(peer.link.side, barrier, entry, active.screen, peer.link.ranges))
    }
    const position = entryPoint(peer.link.side, barrier, at, screen, peer.link.ranges)
    active = { peer, position, screen }
    peer.conn.send({ t: 'enter', x: position.x, y: position.y })
  }

  function onMove(dx: number, dy: number): void {
    if (!active) return
    const { position, screen, peer } = active
    const next = { x: position.x + dx, y: position.y + dy }
    // Arrastando alguma coisa, o cursor não volta: soltaria o que está sendo arrastado no meio do caminho.
    if (crossedBack(peer.link.side, next, screen) && buttons.size === 0) {
      active.position = next
      return returnHere()
    }
    const clamped = {
      x: Math.min(screen.width - 1, Math.max(0, next.x)),
      y: Math.min(screen.height - 1, Math.max(0, next.y))
    }
    const sent = { dx: clamped.x - position.x, dy: clamped.y - position.y }
    active.position = clamped
    if (sent.dx !== 0 || sent.dy !== 0) peer.conn?.send({ t: 'move', ...sent })
  }

  function onCaptureLine(line: string): void {
    const [kind, a, b, c] = line.trim().split(' ')
    switch (kind) {
      case 'ZONE':
        collecting.push({ width: +a, height: +b, x: +c, y: +line.trim().split(' ')[4] })
        return
      case 'ZONES':
        zones = collecting
        collecting = []
        if (zonesReady) {
          zonesReady()
          zonesReady = null
        } else applyBarriers()
        return
      case 'ENTER':
        return onEnter(+a, { x: +b, y: +c })
      case 'LEFT':
        active = null
        return
      case 'move':
        return onMove(+a, +b)
      case 'button':
      case 'key': {
        const held = kind === 'button' ? buttons : keys
        const down = b === '1'
        if (down) held.add(+a)
        else held.delete(+a)
        active?.peer.conn?.send({ t: kind, code: +a, down } as Wire)
        return
      }
      case 'wheel':
      case 'scroll':
        active?.peer.conn?.send({ t: kind, dx: +a, dy: +b } as Wire)
        return
      case 'BARRIER_FAILED':
      case 'ENABLE_FAILED':
        deps.log?.(`modo Mouse: ${line.trim()}`)
        return
    }
  }

  function dropPeer(peer: Peer): void {
    const wasActive = active?.peer === peer
    peer.conn = null
    if (wasActive) returnHere()
  }

  function onSocket(socket: Socket, address: string): void {
    const peer = peers.find((p) => p.link.address === address)
    if (!peer) return void socket.destroy()
    secureLink(socket, token, 'server').then(
      (conn) => {
        peer.conn?.close()
        peer.conn = conn
        peer.lastSeen = now()
        conn.onMessage(() => {
          peer.lastSeen = now()
        })
        conn.onClose(() => {
          if (peer.conn === conn) dropPeer(peer)
        })
      },
      (error: Error) => deps.log?.(`modo Mouse: ${error.message}`)
    )
  }

  function stopAll(): void {
    stopping = true
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
    if (active) returnHere()
    for (const peer of peers) peer.conn?.close()
    peers = []
    capture?.kill()
    capture = null
    inject?.kill()
    inject = null
    client?.close()
    client = null
    stopListening?.()
    stopListening = null
    zones = []
    stopping = false
  }

  return {
    async share({ links, token: agreed }) {
      token = agreed ?? token
      // Mudou a posição com o compartilhamento em andamento: quem já conectou continua.
      peers = links.map((link) => {
        const known = peers.find((p) => p.link.address === link.address)
        return known ? { ...known, link } : { link, barrier: null, conn: null, lastSeen: now() }
      })
      if (active && !peers.some((p) => p.link.address === active?.peer.link.address)) returnHere()
      if (!stopListening) stopListening = await deps.listen(onSocket)
      if (!capture) {
        const started = new Promise<void>((resolve) => (zonesReady = resolve))
        const child = deps.spawn('capture')
        capture = child
        child.onLine(onCaptureLine)
        child.onExit(() => {
          if (capture !== child) return
          capture = null
          active = null
          notifyEnded()
        })
        await started
        pingTimer = setInterval(() => {
          for (const peer of peers) {
            if (!peer.conn) continue
            if (now() - peer.lastSeen > SILENCE_MS) peer.conn.close()
            else peer.conn.send({ t: 'ping' })
          }
        }, PING_MS)
      }
      applyBarriers()
    },
    async follow({ serverAddress, token: agreed }) {
      stopAll()
      const child = deps.spawn('inject')
      inject = child
      child.onExit(() => {
        if (inject !== child) return
        inject = null
        notifyEnded()
      })
      let socket: Socket | null = null
      for (let i = 0; i < CONNECT_TRIES && !socket; i++) {
        socket = await deps.connect(serverAddress).catch(() => null)
        if (!socket) await deps.sleep(CONNECT_WAIT_MS)
      }
      if (!socket) throw new Error('Não consegui conectar ao outro computador.')
      const conn = await secureLink(socket, agreed ?? '', 'client')
      client = conn
      conn.onMessage((message) => {
        if ((message as { t?: unknown }).t === 'ping') return conn.send({ t: 'pong' })
        const line = injectLine(message)
        if (line) child.send(line)
      })
      conn.onClose(() => {
        if (client !== conn) return
        client = null
        notifyEnded()
      })
    },
    stop: stopAll,
    onEnded(listener) {
      ended.add(listener)
      return () => ended.delete(listener)
    }
  }
}
