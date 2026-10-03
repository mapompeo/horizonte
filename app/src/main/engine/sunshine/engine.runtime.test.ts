import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import type { EngineMemory } from './memory'
import { SunshineEngine } from './engine'
import { FakeSunshineProcess } from './testing/fake-process'
import type { PairRequest } from '../port'

const PASSWORD = 'segredo-123'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

interface Ready {
  engine: SunshineEngine
  process: FakeSunshineProcess
  requests: PairRequest[]
  cancelled: string[]
  connected: string[]
  disconnected(): number
}

async function ready(): Promise<Ready> {
  const process = new FakeSunshineProcess()
  process.displays.push({ deviceId: '{vdd}', friendlyName: 'VDD by MTT', originX: 1920 })
  process.rebuildLog()
  const memory: EngineMemory = {
    load: async () => ({ encoder: 'gpu-lowlatency_high_quality' }),
    save: async () => undefined
  }
  const engine = new SunshineEngine({
    installer: { ensureInstalled: async () => undefined },
    display: {
      ensureVirtualDisplay: async () => undefined,
      isVirtual: (d) => d.friendlyName === 'VDD by MTT'
    },
    memory,
    credentials: async () => ({ username: 'u', password: PASSWORD, port: 47989 }),
    createApi: () => process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    timing: { pairingIntervalMs: 100, sessionIntervalMs: 100, pollMs: 100 }
  })
  const requests: PairRequest[] = []
  const cancelled: string[] = []
  const connected: string[] = []
  let disconnected = 0
  engine.onPairRequest((r) => requests.push(r))
  engine.onPairCancelled((id) => cancelled.push(id))
  engine.onClientConnected((d) => connected.push(d))
  engine.onClientDisconnected(() => disconnected++)
  const prepared = engine.prepare(() => undefined, DEFAULT_SETTINGS)
  await vi.advanceTimersByTimeAsync(0)
  await prepared
  return { engine, process, requests, cancelled, connected, disconnected: () => disconnected }
}

describe('pareamento', () => {
  it('um pedido novo no motor de transmissão vira um pedido para a interface', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests).toEqual([{ device: 'Notebook', pairingId: 'p1' }])
  })

  it('dispositivo sem nome ganha um nome genérico', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p2', name: '', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests[0]?.device).toBe('Outro computador')
  })

  it('nome hostil é limpo antes de chegar à interface', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p3', name: `A\nB${String.fromCharCode(0x202e)}C`, address: 'x' })
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests[0]?.device).toBe('ABC')
  })

  it('aprovar com o PIN certo manda o PIN ao motor de transmissão', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    expect(t.process.calls).toContain('submitPin:p1:4821:Notebook')
  })

  it('PIN errado vira uma mensagem clara', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await expect(
      t.engine.approve({ pairingId: 'p1', pin: '0000', name: 'Notebook' })
    ).rejects.toThrow('O PIN não confere')
  })

  it('PIN fora do formato nem chega ao motor de transmissão', async () => {
    const t = await ready()
    await expect(t.engine.approve({ pairingId: 'p1', pin: '12', name: 'x' })).rejects.toThrow('PIN')
    expect(t.process.calls.some((call) => call.startsWith('submitPin'))).toBe(false)
  })

  it('recusar cancela o pedido no motor de transmissão', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.deny('p1')
    expect(t.process.calls).toContain('cancelPairing:p1')
  })

  it('o pedido que some do motor de transmissão avisa o cancelamento', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    t.process.pairings = []
    await vi.advanceTimersByTimeAsync(250)
    expect(t.cancelled).toEqual(['p1'])
  })

  it('a API caindo no meio não derruba a vigilância', async () => {
    const t = await ready()
    t.process.reachable = false
    await vi.advanceTimersByTimeAsync(500)
    t.process.reachable = true
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(1500)
    expect(t.requests).toHaveLength(1)
  })

  it('sem ter preparado, aprovar diz que o motor de transmissão não está pronto', async () => {
    const engine = new SunshineEngine({
      installer: { ensureInstalled: async () => undefined },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: { load: async () => null, save: async () => undefined },
      credentials: async () => ({ username: 'u', password: 'p', port: 1 }),
      createApi: () => new FakeSunshineProcess(),
      readLog: async () => '',
      sleep: async () => undefined
    })
    await expect(engine.approve({ pairingId: 'p', pin: '4821', name: 'x' })).rejects.toThrow(
      'não está pronto'
    )
  })
})

describe('sessão', () => {
  it('cliente que conecta e desconecta vira aviso com o nome do último aprovado', async () => {
    const t = await ready()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(250)
    await t.engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.connected).toEqual(['Notebook'])
    t.process.addLogLine('CLIENT DISCONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.disconnected()).toBe(1)
  })

  it('sem ninguém aprovado, usa um nome genérico', async () => {
    const t = await ready()
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(250)
    expect(t.connected).toEqual(['Outro computador'])
  })
})

describe('parar e abortar', () => {
  it('parar de enviar fecha o aplicativo em execução', async () => {
    const t = await ready()
    await t.engine.stopSending()
    expect(t.process.calls).toContain('closeApp')
  })

  it('abort para as vigilâncias', async () => {
    const t = await ready()
    await t.engine.abort()
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    t.process.addLogLine('CLIENT CONNECTED')
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.requests).toEqual([])
    expect(t.connected).toEqual([])
  })

  it('preparar de novo não duplica as vigilâncias', async () => {
    const t = await ready()
    const again = t.engine.prepare(() => undefined, DEFAULT_SETTINGS)
    await vi.advanceTimersByTimeAsync(0)
    await again
    t.process.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await vi.advanceTimersByTimeAsync(300)
    expect(t.requests).toHaveLength(1)
  })

  it('o ajuste de bitrate só vale na próxima conexão e guarda o limite em kbps', async () => {
    const t = await ready()
    await t.engine.applyBitrate(40)
    expect(t.process.config.max_bitrate).toBe('40000')
  })

  it('ajustar o bitrate sem ter preparado não faz nada', async () => {
    const engine = new SunshineEngine({
      installer: { ensureInstalled: async () => undefined },
      display: { ensureVirtualDisplay: async () => undefined, isVirtual: () => true },
      memory: { load: async () => null, save: async () => undefined },
      credentials: async () => ({ username: 'u', password: 'p', port: 1 }),
      createApi: () => new FakeSunshineProcess(),
      readLog: async () => '',
      sleep: async () => undefined
    })
    await expect(engine.applyBitrate(40)).resolves.toBeUndefined()
  })
})
