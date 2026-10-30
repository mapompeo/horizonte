import { afterEach, describe, expect, it } from 'vitest'
import type { Hello, Want } from './protocol'
import {
  connect,
  startSender,
  type MediaMessage,
  type MediaSide,
  type Sender,
  type Session
} from './session'

const FP_SEND = 'AA:'.repeat(31) + '01'
const FP_SHOW = 'BB:'.repeat(31) + '02'
const sdp = (fp: string): string => `v=0\r\na=fingerprint:sha-256 ${fp}\r\n`

const hello = (name: string, fp: string): Hello => ({
  t: 'hello',
  v: 1,
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  name,
  kind: 'desktop',
  fp
})
const want: Want = {
  t: 'want',
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 30,
  codecs: ['video/H264']
}

/** Janela de mentira: registra o que recebe; a que envia oferece logo ao começar, como a de verdade. */
class FakeMedia implements MediaSide {
  received: MediaMessage[] = []
  stopped = false
  started: Want | null = null
  send: ((message: MediaMessage) => void) | null = null
  constructor(private readonly offerWith: string | null) {}
  start(send: (message: MediaMessage) => void, w: Want): void {
    this.started = w
    this.send = send
    if (this.offerWith) send({ t: 'offer', sdp: sdp(this.offerWith) })
  }
  deliver(message: MediaMessage): void {
    this.received.push(message)
  }
  stop(): void {
    this.stopped = true
  }
}

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

const until = async (check: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('não aconteceu a tempo')
    await new Promise((r) => setTimeout(r, 5))
  }
}

interface Setup {
  sender: Sender
  sendMedia: FakeMedia[]
  sessions: Session[]
  asked: Hello[]
}

async function setup(
  approve: (peer: Hello, cancelled: Promise<void>) => Promise<boolean> = async () => true,
  offerWith: string = FP_SEND
): Promise<Setup> {
  const sendMedia: FakeMedia[] = []
  const sessions: Session[] = []
  const asked: Hello[] = []
  const sender = await startSender({
    port: 0,
    host: '127.0.0.1',
    pingMs: 0,
    hello: () => hello('Desktop', FP_SEND),
    approve: (peer, _address, cancelled) => {
      asked.push(peer)
      return approve(peer, cancelled)
    },
    media: () => {
      const media = new FakeMedia(offerWith)
      sendMedia.push(media)
      return media
    },
    onSession: (session) => sessions.push(session)
  })
  cleanup.push(() => sender.stop())
  return { sender, sendMedia, sessions, asked }
}

function show(
  port: number,
  extra: Partial<Parameters<typeof connect>[0]> = {}
): {
  media: FakeMedia
  session: Promise<Session>
} {
  const media = new FakeMedia(null)
  const session = connect({
    host: '127.0.0.1',
    port,
    pingMs: 0,
    hello: hello('Notebook', FP_SHOW),
    want,
    media: () => media,
    ...extra
  })
  session.then(
    (s) => cleanup.push(() => s.end()),
    () => undefined
  )
  return { media, session }
}

describe('sessão', () => {
  it('pede aprovação, começa e troca as mensagens de mídia', async () => {
    const { sender, sendMedia, sessions, asked } = await setup()
    const pending: string[] = []
    const { media, session } = show(sender.port, { onPending: (p) => pending.push(p.name) })
    const s = await session
    expect(s.peer.name).toBe('Desktop')
    expect(asked.map((p) => p.name)).toEqual(['Notebook'])
    expect(pending).toEqual(['Desktop'])

    await until(() => media.received.length === 1)
    expect(media.received[0]).toEqual({ t: 'offer', sdp: sdp(FP_SEND) })
    expect(sendMedia[0].started).toEqual(want)

    media.send?.({ t: 'answer', sdp: sdp(FP_SHOW) })
    media.send?.({ t: 'ice', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 })
    await until(() => sendMedia[0].received.length === 2)
    expect(sessions).toHaveLength(1)
  })

  it('encerra dos dois lados quando um sai', async () => {
    const { sender, sendMedia, sessions } = await setup()
    const { media, session } = show(sender.port)
    const s = await session
    await until(() => sessions.length === 1)
    const ended: string[] = []
    sessions[0].onEnded((r) => ended.push(r))
    s.end()
    await until(() => ended.length === 1)
    expect(sendMedia[0].stopped).toBe(true)
    expect(media.stopped).toBe(true)
    expect(ended).toEqual(['encerrada'])
  })

  it('recusa quando a pessoa não permite', async () => {
    const { sender } = await setup(async () => false)
    await expect(show(sender.port).session).rejects.toThrow(/não permitiu/)
  })

  it('atende um por vez', async () => {
    const { sender, sessions } = await setup()
    await show(sender.port).session
    await until(() => sessions.length === 1)
    await expect(show(sender.port).session).rejects.toThrow(/já está mostrando/)
  })

  it('volta a aceitar depois que a sessão acaba', async () => {
    const { sender, sessions } = await setup()
    const first = await show(sender.port).session
    await until(() => sessions.length === 1)
    const ended = new Promise((resolve) => sessions[0].onEnded(resolve))
    first.end()
    await ended
    await show(sender.port).session
    await until(() => sessions.length === 2)
  })

  it('derruba a sessão se a oferta vier com outro certificado', async () => {
    const { sender } = await setup(undefined, 'CC:'.repeat(31) + '03')
    const { media, session } = show(sender.port)
    const s = await session
    const ended = new Promise<string>((resolve) => s.onEnded(resolve))
    expect(await ended).toBe('certificado diferente')
    expect(media.received).toEqual([])
    expect(media.stopped).toBe(true)
  })

  it('para de perguntar quando quem pediu desiste', async () => {
    let cancelledSeen = false
    const { sender } = await setup(async (_peer, cancelled) => {
      await cancelled
      cancelledSeen = true
      return true
    })
    const controller = new AbortController()
    const { session } = show(sender.port, {
      signal: controller.signal,
      onPending: () => controller.abort()
    })
    await expect(session).rejects.toThrow(/Cancelado/)
    await until(() => cancelledSeen)
  })

  it('desiste se ninguém responder ao pedido', async () => {
    const { sender } = await setup(() => new Promise(() => undefined))
    await expect(show(sender.port, { approvalTimeoutMs: 50 }).session).rejects.toThrow(
      /não respondeu ao pedido/
    )
  })
})
