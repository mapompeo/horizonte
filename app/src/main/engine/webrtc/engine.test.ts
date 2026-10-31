import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import type { ScreenPlacement } from '../../../shared/types'
import type { PairRequest } from '../port'
import type { ScreenRequest, VirtualScreen } from './display'
import {
  WebRtcEngine,
  type MediaHooks,
  type MotorWindows,
  type ReceiverWindow,
  type WebRtcHost
} from './engine'
import type { MediaMessage, MediaSide } from './session'

const FP = { send: 'AA:'.repeat(31) + '01', show: 'BB:'.repeat(31) + '02' }
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const sdp = (fp: string): string => `v=0\r\na=fingerprint:sha-256 ${fp}\r\n`
const settings = { ...DEFAULT_SETTINGS, fps: 60 as const, bitrate: 30 }

/** Janela de mentira: a que envia oferece ao começar, como a de verdade. */
class FakeMedia implements MediaSide {
  received: MediaMessage[] = []
  started = false
  stopped = false
  constructor(
    private readonly fp: string | null,
    readonly hooks: MediaHooks = {}
  ) {}
  start(send: (message: MediaMessage) => void, want: Parameters<MediaSide['start']>[1]): void {
    void (this.hooks.beforeStart?.(want) ?? Promise.resolve()).then(() => {
      this.started = true
      if (this.fp) send({ t: 'offer', sdp: sdp(this.fp) })
    })
  }
  deliver(message: MediaMessage): void {
    this.received.push(message)
  }
  stop(): void {
    this.stopped = true
    this.hooks.afterStop?.()
  }
}

function fakeWindows(fp: string): MotorWindows & {
  sent: FakeMedia[]
  receivers: (ReceiverWindow & { closed: boolean; quit(): void; shown: FakeMedia[] })[]
} {
  const sent: FakeMedia[] = []
  const receivers: (ReceiverWindow & { closed: boolean; quit(): void; shown: FakeMedia[] })[] = []
  return {
    sent,
    receivers,
    identity: async () => ({ id: ID, fp }),
    sendMedia: (hooks) => {
      const media = new FakeMedia(fp, hooks)
      sent.push(media)
      return media
    },
    openReceiver: async () => {
      let onQuit = (): void => undefined
      const shown: FakeMedia[] = []
      const window = {
        codecs: ['video/H264'],
        size: { width: 1366, height: 768 },
        closed: false,
        shown,
        media: () => {
          const media = new FakeMedia(null)
          shown.push(media)
          return media
        },
        onQuit: (callback: () => void) => {
          onQuit = callback
        },
        quit: () => onQuit(),
        close: () => {
          window.closed = true
        }
      }
      receivers.push(window)
      return window
    }
  }
}

function fakeScreen(): VirtualScreen & {
  requests: ScreenRequest[]
  released: number
  placed: ScreenPlacement[]
  inputs: string[]
} {
  const screen = {
    requests: [] as ScreenRequest[],
    released: 0,
    placed: [] as ScreenPlacement[],
    inputs: [] as string[],
    input: (line: string) => {
      screen.inputs.push(line)
    },
    place: async (placement: ScreenPlacement) => {
      screen.placed.push(placement)
    },
    ensure: async (request: ScreenRequest) => {
      screen.requests.push(request)
      return 77
    },
    release: async () => {
      screen.released++
    }
  }
  return screen
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

function pair(): {
  sender: WebRtcEngine
  shower: WebRtcEngine
  sendWindows: ReturnType<typeof fakeWindows>
  showWindows: ReturnType<typeof fakeWindows>
  screen: ReturnType<typeof fakeScreen>
  announced: (number | null)[]
  requests: PairRequest[]
} {
  const announced: (number | null)[] = []
  const requests: PairRequest[] = []
  const sendWindows = fakeWindows(FP.send)
  const showWindows = fakeWindows(FP.show)
  const screen = fakeScreen()
  const signaling = { port: 0, host: '127.0.0.1', pingMs: 0 }
  const sender = new WebRtcEngine({
    windows: sendWindows,
    presence: { setSending: (info) => announced.push(info?.port ?? null), hosts: async () => [] },
    virtualScreen: screen,
    frames: '/run/user/1000/horizonte.sock',
    deviceName: () => 'Desktop',
    kind: () => 'desktop',
    screenSize: () => ({ width: 1920, height: 1080 }),
    placementFor: (fp) => (fp === FP.show ? { side: 'left', offset: 0.25 } : null),
    signaling
  })
  const shower = new WebRtcEngine({
    windows: showWindows,
    presence: {
      setSending: () => undefined,
      hosts: async (): Promise<WebRtcHost[]> => [
        { name: 'Desktop', address: '127.0.0.1', port: announced.at(-1) ?? 0 }
      ]
    },
    virtualScreen: null,
    frames: null,
    deviceName: () => 'Notebook',
    kind: () => 'laptop',
    screenSize: () => ({ width: 1366, height: 768 }),
    signaling
  })
  sender.onPairRequest((request) => requests.push(request))
  cleanup.push(
    () => sender.abort(),
    () => shower.disconnect()
  )
  return { sender, shower, sendWindows, showWindows, screen, announced, requests }
}

describe('WebRtcEngine', () => {
  it('prepara, anuncia e passa pelas três etapas', async () => {
    const { sender, announced } = pair()
    const steps: string[] = []
    await sender.prepare((step) => steps.push(step), settings)
    expect(steps).toEqual(['engine', 'display', 'encoder'])
    expect(announced).toHaveLength(1)
    expect(announced[0]).toBeGreaterThan(0)
  })

  it('pede aprovação com a identidade do outro aparelho e conecta depois do sim', async () => {
    const { sender, shower, sendWindows, showWindows, screen, requests } = pair()
    const connected: string[] = []
    sender.onClientConnected((device) => connected.push(device))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()

    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    expect(requests[0]).toMatchObject({
      device: 'Notebook',
      address: '127.0.0.1',
      deviceId: ID,
      fingerprint: FP.show
    })
    expect(requests[0].pin).toBeUndefined()

    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await until(() => connected.length === 1)
    expect(connected).toEqual(['Notebook'])

    // A tela estendida é criada no tamanho da tela de quem mostra, e a janela recebe a oferta.
    await until(() => sendWindows.sent[0]?.started === true)
    expect(screen.requests).toEqual([{ width: 1366, height: 768, fps: 60 }])
    expect(sender.target()).toBe(77)
    await until(() => showWindows.receivers[0].shown[0]?.received.length === 1)
    expect(showWindows.receivers[0].shown[0].received[0]).toEqual({
      t: 'offer',
      sdp: sdp(FP.send)
    })
  })

  it('recusa quando a pessoa nega, e a janela de quem mostra fecha', async () => {
    const { sender, shower, showWindows, requests } = pair()
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    await sender.deny(requests[0].pairingId)
    await expect(connecting).rejects.toThrow(/não permitiu/)
    expect(showWindows.receivers[0].closed).toBe(true)
  })

  it('avisa quando quem pediu desiste antes da resposta', async () => {
    const { sender, shower, requests } = pair()
    const cancelled: string[] = []
    sender.onPairCancelled((id) => cancelled.push(id))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings).catch(() => undefined)
    await until(() => requests.length === 1)
    await shower.disconnect()
    await connecting
    await until(() => cancelled.length === 1)
    expect(cancelled).toEqual([requests[0].pairingId])
    await expect(
      sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    ).rejects.toThrow(/não está mais esperando/)
  })

  it('quem mostra encerra: quem envia fica pronto de novo e a tela estendida é desligada', async () => {
    const { sender, shower, showWindows, screen, requests } = pair()
    const disconnected: number[] = []
    sender.onClientDisconnected(() => disconnected.push(1))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await until(() => screen.requests.length === 1)

    showWindows.receivers[0].quit()
    await until(() => disconnected.length === 1)
    expect(showWindows.receivers[0].closed).toBe(true)
    await until(() => screen.released === 1)
    expect(sender.target()).toBeNull()
  })

  it('quem envia para: quem mostra recebe o fim da transmissão', async () => {
    const { sender, shower, showWindows, requests } = pair()
    const ended: number[] = []
    const connected: string[] = []
    shower.onStreamEnded(() => ended.push(1))
    sender.onClientConnected((device) => connected.push(device))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await until(() => connected.length === 1)

    await sender.stopSending()
    await until(() => ended.length === 1)
    expect(showWindows.receivers[0].closed).toBe(true)
  })

  it('leva o ajuste de bitrate de quem mostra até a janela de quem envia', async () => {
    const { sender, shower, sendWindows, requests } = pair()
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await shower.applyBitrate(12)
    await until(() => sendWindows.sent[0]?.received.some((m) => m.t === 'bitrate'))
    expect(sendWindows.sent[0].received).toContainEqual({ t: 'bitrate', mbps: 12 })
  })

  it('para de anunciar e de escutar ao sair do modo enviar', async () => {
    const { sender, shower, announced } = pair()
    await sender.prepare(() => undefined, settings)
    await sender.abort()
    expect(announced.at(-1)).toBeNull()
    await shower.listHosts()
    await expect(shower.connect('127.0.0.1', settings)).rejects.toThrow()
  })

  it('põe a tela de quem conectou onde a pessoa deixou, e muda na hora', async () => {
    const { sender, shower, screen, requests } = pair()
    const peers: unknown[] = []
    sender.onClientConnected((_device, peer) => peers.push(peer))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    expect(requests[0].screen).toEqual({ width: 1366, height: 768 })
    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await until(() => screen.placed.length === 1)
    expect(screen.placed).toEqual([{ side: 'left', offset: 0.25 }])
    await until(() => peers.length === 1)
    expect(peers[0]).toEqual({ fingerprint: FP.show, screen: { width: 1366, height: 768 } })

    await sender.placeScreen({ side: 'above' })
    expect(screen.placed.at(-1)).toEqual({ side: 'above' })
  })

  it('sem ninguém conectado, mudar a posição não mexe na tela', async () => {
    const { sender, screen } = pair()
    await sender.prepare(() => undefined, settings)
    await sender.placeScreen({ side: 'above' })
    expect(screen.placed).toEqual([])
  })

  it('entrada de quem mostra: só a válida, e só durante a sessão aprovada', async () => {
    const { sender, shower, sendWindows, screen, requests } = pair()
    const connected: string[] = []
    const disconnected: number[] = []
    sender.onClientConnected((device) => connected.push(device))
    sender.onClientDisconnected(() => disconnected.push(1))
    await sender.prepare(() => undefined, settings)
    await shower.listHosts()
    const connecting = shower.connect('127.0.0.1', settings)
    await until(() => requests.length === 1)
    await sender.approve({ pairingId: requests[0].pairingId, name: 'Notebook' })
    await connecting
    await until(() => connected.length === 1)

    const media = sendWindows.sent[0]
    media.hooks.onInput?.('{"t":"move","x":0.5,"y":0.25}')
    media.hooks.onInput?.('{"t":"key","code":"KeyA","down":true}')
    media.hooks.onInput?.('{"t":"exec","cmd":"rm -rf"}')
    media.hooks.onInput?.('{"t":"move","x":7,"y":0}')
    expect(screen.inputs).toEqual(['move 0.50000 0.25000\n', 'key 30 1\n'])

    await shower.disconnect()
    await until(() => disconnected.length === 1)
    media.hooks.onInput?.('{"t":"move","x":0.1,"y":0.1}')
    expect(screen.inputs).toHaveLength(2)
  })
})
