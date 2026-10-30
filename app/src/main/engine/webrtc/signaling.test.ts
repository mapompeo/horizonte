import { connect as rawConnect, createServer, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { Hello, Message } from './protocol'
import { dial, listen, wrapSocket, type Link, type SignalingServer } from './signaling'

const FP = 'AB:'.repeat(31) + 'CD'
const hello = (name: string, v = 1): Hello => ({
  t: 'hello',
  v,
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  name,
  kind: 'desktop',
  fp: FP
})

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

function next(link: Link): Promise<Message> {
  return new Promise((resolve) => {
    const stop = link.onMessage((message) => {
      stop()
      resolve(message)
    })
  })
}

const closed = (link: Link): Promise<string> =>
  new Promise((resolve) => link.onClose((reason) => resolve(reason)))

async function server(
  onLink: (link: Link, peer: Hello) => void = () => undefined,
  extra: Partial<Parameters<typeof listen>[0]> = {}
): Promise<SignalingServer> {
  const s = await listen({
    port: 0,
    host: '127.0.0.1',
    pingMs: 0,
    hello: () => hello('Desktop'),
    onLink,
    ...extra
  })
  cleanup.push(() => s.close())
  return s
}

/** Um par de sockets já conectados, para testar o enquadramento sem o servidor. */
async function pair(): Promise<[Socket, Socket]> {
  const accepted = new Promise<Socket>((resolve) => {
    const srv = createServer(resolve)
    cleanup.push(() => srv.close())
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      if (typeof address === 'object' && address) {
        const client = rawConnect(address.port, '127.0.0.1')
        cleanup.push(() => client.destroy())
        sockets.push(client)
      }
    })
  })
  const sockets: Socket[] = []
  const other = await accepted
  cleanup.push(() => other.destroy())
  return [sockets[0], other]
}

describe('sinalização', () => {
  it('troca hello e entrega as mensagens seguintes a quem assumiu a conexão', async () => {
    const got = new Promise<[Hello, Message]>((resolve) => {
      void server((link, peer) => {
        void next(link).then((message) => resolve([peer, message]))
      }).then(async (s) => {
        const link = await dial('127.0.0.1', s.port, { pingMs: 0 })
        cleanup.push(() => link.close())
        link.send(hello('Notebook'))
        // Mandadas juntas com o hello: precisam chegar mesmo antes de alguém escutar.
        link.send({ t: 'cancel' })
        expect(await next(link)).toMatchObject({ t: 'hello', name: 'Desktop' })
      })
    })
    const [peer, message] = await got
    expect(peer.name).toBe('Notebook')
    expect(message).toEqual({ t: 'cancel' })
  })

  it('recusa versão diferente, mas se apresenta antes', async () => {
    const s = await server(() => expect.unreachable())
    const link = await dial('127.0.0.1', s.port, { pingMs: 0 })
    const messages: Message[] = []
    link.onMessage((m) => messages.push(m))
    link.send(hello('Notebook', 2))
    await closed(link)
    expect(messages.map((m) => m.t)).toEqual(['hello', 'denied'])
    expect(messages[1]).toEqual({ t: 'denied', reason: 'version' })
  })

  it('fecha quem não se apresenta a tempo', async () => {
    const errors: Error[] = []
    const s = await server(undefined, { helloTimeoutMs: 50, onError: (e) => errors.push(e) })
    const link = await dial('127.0.0.1', s.port, { pingMs: 0 })
    await closed(link)
    expect(errors[0]?.message).toMatch(/não se apresentou/)
  })

  it('fecha quem começa por outra mensagem', async () => {
    const s = await server(() => expect.unreachable())
    const link = await dial('127.0.0.1', s.port, { pingMs: 0 })
    link.send({ t: 'cancel' })
    await closed(link)
  })

  it('não passa do limite de conexões', async () => {
    const s = await server(undefined, { maxConnections: 1 })
    const first = await dial('127.0.0.1', s.port, { pingMs: 0 })
    cleanup.push(() => first.close())
    const second = await dial('127.0.0.1', s.port, { pingMs: 0 })
    expect(await closed(second)).toBe('fechada pelo outro lado')
    expect(first.closed).toBe(false)
  })

  it('usa a próxima porta quando a primeira está ocupada', async () => {
    const busy = await server()
    const s = await listen({
      host: '127.0.0.1',
      pingMs: 0,
      hello: () => hello('Desktop'),
      onLink: () => undefined
    })
    cleanup.push(() => s.close())
    expect(s.port).not.toBe(busy.port)
    expect(s.port).toBeGreaterThanOrEqual(47910)
    expect(s.port).toBeLessThanOrEqual(47919)
  })

  it('explica quando ninguém está esperando', async () => {
    const s = await server()
    const port = s.port
    await s.close()
    await expect(dial('127.0.0.1', port)).rejects.toThrow(/Escolha Enviar/)
  })
})

describe('enquadramento', () => {
  it('junta linhas quebradas em vários pedaços', async () => {
    const [a, b] = await pair()
    const link = wrapSocket(b, { pingMs: 0 })
    const got = next(link)
    const line = JSON.stringify({ t: 'bitrate', mbps: 25 }) + '\n'
    a.write(line.slice(0, 5))
    await new Promise((r) => setTimeout(r, 20))
    a.write(line.slice(5))
    expect(await got).toEqual({ t: 'bitrate', mbps: 25 })
  })

  it('fecha com linha inválida', async () => {
    const [a, b] = await pair()
    const link = wrapSocket(b, { pingMs: 0 })
    a.write('isso não é json\n')
    expect(await closed(link)).toBe('mensagem inválida')
  })

  it('fecha com mensagem grande demais, sem esperar o fim da linha', async () => {
    const [a, b] = await pair()
    const link = wrapSocket(b, { pingMs: 0 })
    a.write('x'.repeat(70 * 1024))
    expect(await closed(link)).toBe('mensagem grande demais')
  })

  it('responde ao ping e não repassa ping nem pong', async () => {
    const [a, b] = await pair()
    const right = wrapSocket(b, { pingMs: 0 })
    const seen: Message[] = []
    right.onMessage((m) => seen.push(m))
    const raw = new Promise<string>((resolve) => a.once('data', (chunk) => resolve(String(chunk))))
    a.write(JSON.stringify({ t: 'ping', at: 1 }) + '\n')
    a.write(JSON.stringify({ t: 'pong', at: 2 }) + '\n')
    expect(JSON.parse(await raw)).toEqual({ t: 'pong', at: 1 })
    expect(seen).toEqual([])
  })

  it('cai quando o outro lado para de responder ao ping', async () => {
    const [a, b] = await pair()
    a.pause() // o outro lado não lê nada: nenhum pong volta
    const link = wrapSocket(b, { pingMs: 10, maxMissed: 3 })
    expect(await closed(link)).toBe('sem resposta')
  })

  it('manda a última mensagem antes de fechar', async () => {
    const [a, b] = await pair()
    const left = wrapSocket(a, { pingMs: 0 })
    const right = wrapSocket(b, { pingMs: 0 })
    const got = next(right)
    left.send({ t: 'bye', reason: 'user' })
    left.close()
    expect(await got).toEqual({ t: 'bye', reason: 'user' })
  })
})
