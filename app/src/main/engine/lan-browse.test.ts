import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// A busca e o anúncio na rede local, com o Bonjour de mentira: uma instância por interface IPv4, o próprio PC fora da
// lista, um resultado por endereço e tudo desligado no fim.

const net = vi.hoisted(() => ({
  interfaces: {} as Record<string, { address: string; family: string; internal: boolean }[]>
}))
vi.mock('node:os', () => ({ networkInterfaces: () => net.interfaces }))

const bonjours = vi.hoisted(
  () =>
    [] as {
      options: { interface?: string }
      found: ((service: Record<string, unknown>) => void)[]
      published: Record<string, unknown>[]
      stopped: number
      destroyed: boolean
    }[]
)
vi.mock('bonjour-service', () => ({
  Bonjour: class {
    state
    server = { mdns: { on: () => undefined } }
    constructor(options: { interface?: string }) {
      this.state = { options, found: [], published: [], stopped: 0, destroyed: false }
      bonjours.push(this.state)
    }
    find(_query: unknown, onUp: (service: Record<string, unknown>) => void): { stop(): number } {
      this.state.found.push(onUp)
      return { stop: () => (this.state.stopped += 1) }
    }
    publish(service: Record<string, unknown>): { stop(): number } {
      this.state.published.push(service)
      return { stop: () => (this.state.stopped += 1) }
    }
    destroy(): void {
      this.state.destroyed = true
    }
  }
}))

const { advertiseService, browseService, ownAddresses } = await import('./lan')

beforeEach(() => {
  bonjours.length = 0
  net.interfaces = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    wlan0: [
      { address: '192.168.1.7', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false }
    ],
    docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }]
  }
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

test('endereços deste PC incluem todas as interfaces', () => {
  expect(ownAddresses()).toEqual(new Set(['127.0.0.1', '192.168.1.7', 'fe80::1', '172.17.0.1']))
})

test('busca: uma instância por interface IPv4 de fora, sem este PC, um por endereço e em ordem de nome', async () => {
  const result = browseService('horizonte')
  expect(bonjours.map((b) => b.options.interface)).toEqual(['192.168.1.7', '172.17.0.1'])
  const [wifi, docker] = bonjours
  // O anúncio do próprio PC (voltando pela rede) fica de fora.
  wifi.found[0]({ name: 'Eu', referer: { address: '192.168.1.7' }, addresses: [] })
  // A lista traz o Docker na frente; vale o endereço de onde o anúncio veio.
  wifi.found[0]({
    name: 'Notebook',
    referer: { address: '192.168.1.20' },
    addresses: ['172.17.0.5'],
    txt: { v: 3, fp: 'AB' }
  })
  // O mesmo aparelho visto pela outra interface: um resultado só.
  docker.found[0]({
    name: 'Notebook',
    referer: { address: '192.168.1.20' },
    txt: { v: 3, fp: 'AB' }
  })
  docker.found[0]({ name: 'Desktop', addresses: ['fe80::9', '192.168.1.30'] })
  docker.found[0]({ name: 'Sem IPv4', addresses: ['fe80::2'] })
  await vi.advanceTimersByTimeAsync(1500)
  expect(await result).toEqual([
    { name: 'Desktop', address: '192.168.1.30', txt: {} },
    { name: 'Notebook', address: '192.168.1.20', txt: { v: '3', fp: 'AB' } }
  ])
  expect(bonjours.every((b) => b.stopped === 1 && b.destroyed)).toBe(true)
})

test('anúncio: publica em cada interface, sem sondagem, e o parar desliga tudo', () => {
  const stop = advertiseService('Meu PC', 'horizonte', 47920, { v: '3' })
  expect(bonjours.map((b) => b.published)).toEqual([
    [{ name: 'Meu PC', type: 'horizonte', port: 47920, probe: false, txt: { v: '3' } }],
    [{ name: 'Meu PC', type: 'horizonte', port: 47920, probe: false, txt: { v: '3' } }]
  ])
  expect(bonjours.some((b) => b.destroyed)).toBe(false)
  stop()
  expect(bonjours.every((b) => b.stopped === 1 && b.destroyed)).toBe(true)
})
