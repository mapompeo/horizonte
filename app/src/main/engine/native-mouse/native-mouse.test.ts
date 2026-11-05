import { connect, createServer, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { barrierFor, crossedBack, entryPoint, returnPoint, type Zone } from './geometry'
import { createNativeMouseShare, injectLine, type LineProcess } from './native-share'
import { secureLink } from './secure-link'

const screen: Zone = { width: 1920, height: 1080, x: 0, y: 0 }
const TOKEN = 'ab'.repeat(32)
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const clean of cleanup.splice(0)) clean()
})

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('o tempo acabou')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function pair(onServer: (socket: Socket) => void): Promise<{ client: Socket; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(onServer)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      const client = connect(port, '127.0.0.1')
      cleanup.push(() => {
        client.destroy()
        server.close()
      })
      resolve({ client, server })
    })
  })
}

describe('geometria das barreiras', () => {
  it('fica na borda da área de trabalho, no trecho combinado', () => {
    expect(barrierFor('right', [screen])).toEqual({ x1: 1920, y1: 0, x2: 1920, y2: 1079 })
    expect(barrierFor('left', [screen])).toEqual({ x1: 0, y1: 0, x2: 0, y2: 1079 })
    expect(barrierFor('below', [screen])).toEqual({ x1: 0, y1: 1080, x2: 1919, y2: 1080 })
    expect(barrierFor('above', [screen], { own: [50, 100], peer: [0, 100] })).toEqual({
      x1: 960,
      y1: 0,
      x2: 1919,
      y2: 0
    })
  })

  it('com duas telas, só a que toca a borda; sem telas ou sem trecho, nenhuma', () => {
    const low: Zone = { width: 1280, height: 720, x: 1920, y: 360 }
    expect(barrierFor('right', [screen, low])).toEqual({ x1: 3200, y1: 360, x2: 3200, y2: 1079 })
    expect(barrierFor('right', [])).toBeNull()
    expect(barrierFor('right', [screen], { own: [40, 40], peer: [0, 100] })).toBeNull()
  })

  it('entra do lado oposto, na altura proporcional, e volta logo para dentro da barreira', () => {
    const barrier = { x1: 1920, y1: 0, x2: 1920, y2: 1079 }
    const peer = { width: 1366, height: 768 }
    const entry = entryPoint('right', barrier, { x: 1920, y: 539.5 }, peer)
    expect(entry).toEqual({ x: 0, y: 384 })
    const back = returnPoint('right', barrier, { x: -1, y: 384 }, peer)
    expect(back.x).toBe(1918)
    expect(back.y).toBeCloseTo(539.6, 0)
    expect(crossedBack('right', { x: -1, y: 0 }, peer)).toBe(true)
    expect(crossedBack('right', { x: 0, y: 0 }, peer)).toBe(false)
    expect(crossedBack('left', { x: 1366, y: 0 }, peer)).toBe(true)
    expect(crossedBack('above', { x: 0, y: 768 }, peer)).toBe(true)
    expect(crossedBack('below', { x: 0, y: -1 }, peer)).toBe(true)
  })
})

describe('canal cifrado', () => {
  it('leva mensagens nos dois sentidos, e o que passa na rede não é legível', async () => {
    const seen: Buffer[] = []
    let serverSide: Socket | null = null
    const { client } = await pair((socket) => {
      serverSide = socket
      socket.on('data', (chunk: Buffer) => seen.push(chunk))
    })
    await until(() => serverSide !== null)
    const [a, b] = await Promise.all([
      secureLink(client, TOKEN, 'client'),
      secureLink(serverSide as unknown as Socket, TOKEN, 'server')
    ])
    const got: unknown[] = []
    b.onMessage((message) => got.push(message))
    a.send({ t: 'key', code: 30, down: true, segredo: 'minha-senha' })
    await until(() => got.length === 1)
    expect(got[0]).toEqual({ t: 'key', code: 30, down: true, segredo: 'minha-senha' })
    expect(Buffer.concat(seen).includes('minha-senha')).toBe(false)
  })

  it('com o segredo errado, não conecta', async () => {
    let serverSide: Socket | null = null
    const { client } = await pair((socket) => {
      serverSide = socket
    })
    await until(() => serverSide !== null)
    const results = await Promise.allSettled([
      secureLink(client, TOKEN, 'client'),
      secureLink(serverSide as unknown as Socket, 'cd'.repeat(32), 'server')
    ])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })
})

describe('o que vem da rede', () => {
  it('só vira comando depois de conferido', () => {
    expect(injectLine({ t: 'move', dx: 3, dy: -2.5 })).toBe('move 3 -2.5\n')
    expect(injectLine({ t: 'key', code: 30, down: true })).toBe('key 30 1\n')
    expect(injectLine({ t: 'enter', x: 0, y: 384 })).toBe('warp 0 384\n')
    expect(injectLine({ t: 'wheel', dx: 0, dy: 120 })).toBe('wheel 0 120\n')
    // Tentativas de pôr outro comando na entrada do auxiliar, e formatos errados.
    expect(injectLine({ t: 'move', dx: '1\nrelease 0 0', dy: 0 })).toBeNull()
    expect(injectLine({ t: 'key', code: '30\nkey 1', down: true })).toBeNull()
    expect(injectLine({ t: 'key', code: 30 })).toBeNull()
    expect(injectLine({ t: 'release', x: 0, y: 0 })).toBeNull()
    expect(injectLine({ t: 'move', dx: Infinity, dy: 0 })).toBeNull()
    expect(injectLine(null)).toBeNull()
  })
})

/** Dois computadores de mentira na mesma máquina: auxiliares falsos e a rede de verdade (localhost). */
async function twoComputers(): Promise<{
  capture: LineProcess & { sent: string[]; emit(line: string): void }
  inject: LineProcess & { sent: string[] }
  ended: string[]
  server: ReturnType<typeof createNativeMouseShare>
  client: ReturnType<typeof createNativeMouseShare>
  killClient(): void
}> {
  const fake = (): LineProcess & { sent: string[]; emit(line: string): void } => {
    const listeners: ((line: string) => void)[] = []
    return {
      sent: [],
      send(line) {
        this.sent.push(line)
      },
      onLine: (listener) => void listeners.push(listener),
      onExit: () => undefined,
      kill: () => undefined,
      emit: (line) => listeners.forEach((listener) => listener(line))
    }
  }
  const capture = fake()
  const inject = fake()
  let port = 0
  let clientSocket: Socket | null = null
  const base = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }
  const server = createNativeMouseShare({
    ...base,
    spawn: () => {
      queueMicrotask(() => {
        capture.emit('ZONE 1920 1080 0 0')
        capture.emit('ZONES')
      })
      return capture
    },
    listen: (onSocket) =>
      new Promise((resolve) => {
        const net = createServer((socket) => onSocket(socket, '127.0.0.1'))
        net.listen(0, '127.0.0.1', () => {
          port = (net.address() as { port: number }).port
          resolve(() => void net.close())
          cleanup.push(() => net.close())
        })
      }),
    connect: () => Promise.reject(new Error('não usa'))
  })
  const client = createNativeMouseShare({
    ...base,
    spawn: () => inject,
    listen: () => Promise.resolve(() => undefined),
    connect: () =>
      new Promise((resolve, reject) => {
        const socket = connect(port, '127.0.0.1')
        clientSocket = socket
        cleanup.push(() => socket.destroy())
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      })
  })
  const ended: string[] = []
  client.onEnded(() => ended.push('controlado'))
  await server.share({
    name: 'Desktop',
    token: TOKEN,
    links: [
      {
        name: 'Notebook',
        side: 'right',
        address: '127.0.0.1',
        screen: { width: 1000, height: 500 }
      }
    ]
  })
  await client.follow({ name: 'Notebook', serverAddress: '127.0.0.1', token: TOKEN })
  cleanup.push(() => {
    server.stop()
    client.stop()
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  return { capture, inject, ended, server, client, killClient: () => clientSocket?.destroy() }
}

describe('modo Mouse sem Deskflow, de ponta a ponta', () => {
  it('liga a barreira da borda e, ao cruzar, o cursor anda no outro computador', async () => {
    const t = await twoComputers()
    expect(t.capture.sent).toContain('barrier 0 1920 0 1920 1079\n')
    expect(t.capture.sent).toContain('apply\n')
    t.capture.emit('ENTER 0 1920 540')
    t.capture.emit('move 10 5')
    t.capture.emit('key 30 1')
    t.capture.emit('button 272 1')
    t.capture.emit('button 272 0')
    t.capture.emit('wheel 0 120')
    await until(() => t.inject.sent.includes('wheel 0 120\n'))
    expect(t.inject.sent[0]).toBe('warp 0 250\n')
    expect(t.inject.sent).toContain('move 10 5\n')
    expect(t.inject.sent).toContain('key 30 1\n')
    expect(t.inject.sent).toContain('button 272 1\n')
  })

  it('voltando pela borda, solta as teclas apertadas lá e devolve o cursor aqui', async () => {
    const t = await twoComputers()
    t.capture.emit('ENTER 0 1920 540')
    t.capture.emit('key 42 1')
    t.capture.emit('move -5 0')
    await until(() => t.capture.sent.some((l) => l.startsWith('release')))
    expect(t.capture.sent.find((l) => l.startsWith('release'))).toMatch(/^release 1918 5\d\d/)
    await until(() => t.inject.sent.includes('key 42 0\n'))
    // Depois de voltar, nada mais vai para lá.
    const before = t.inject.sent.length
    t.capture.emit('move 50 0')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(t.inject.sent.length).toBe(before)
  })

  it('arrastando alguma coisa, o cursor não volta; não passa das bordas do outro', async () => {
    const t = await twoComputers()
    t.capture.emit('ENTER 0 1920 540')
    t.capture.emit('button 272 1')
    t.capture.emit('move -5 0')
    t.capture.emit('move 0 -9999')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(t.capture.sent.some((l) => l.startsWith('release'))).toBe(false)
    await until(() => t.inject.sent.includes('move 0 -250\n'))
  })

  it('se a conexão cair com o cursor lá, o mouse volta para cá na hora', async () => {
    const t = await twoComputers()
    t.capture.emit('ENTER 0 1920 540')
    await until(() => t.inject.sent.length > 0)
    t.killClient()
    await until(() => t.capture.sent.some((l) => l.startsWith('release')))
    await until(() => t.ended.includes('controlado'))
  })

  it('sem o outro conectado, cruzar a borda não prende o cursor', async () => {
    const t = await twoComputers()
    t.killClient()
    await new Promise((resolve) => setTimeout(resolve, 30))
    t.capture.emit('ENTER 0 1920 540')
    expect(t.capture.sent.at(-1)).toMatch(/^release 1918 /)
  })
})
