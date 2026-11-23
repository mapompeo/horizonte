import { describe, expect, test } from 'vitest'
import { createAdapter, netSignal, type NetSignal } from './adapt'
import type { StatEntry } from './stats'

const clean: NetSignal = { lossFraction: 0, rttMs: 5, limitation: 'none' }
const lossy: NetSignal = { lossFraction: 0.05, rttMs: 5, limitation: 'none' }

function run(adapter: ReturnType<typeof createAdapter>, signal: NetSignal, seconds: number): void {
  for (let i = 0; i < seconds; i++) adapter.next(signal)
}

describe('qualidade automática', () => {
  test('com a rede boa fica no teto e não muda nada', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    for (let i = 0; i < 30; i++) expect(adapter.next(clean)).toBeNull()
    expect(adapter.current()).toEqual({ mbps: 30, fps: 60 })
  })

  test('perda de um segundo só não baixa (histerese); dois seguidos baixam 20%', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    expect(adapter.next(lossy)).toBeNull()
    expect(adapter.next(clean)).toBeNull()
    expect(adapter.next(lossy)).toBeNull()
    expect(adapter.next(lossy)).toEqual({ mbps: 24, fps: 60 })
  })

  test('fila na rede (ida e volta subindo) também baixa', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    run(adapter, clean, 3)
    run(adapter, { lossFraction: 0, rttMs: 80, limitation: 'none' }, 2)
    expect(adapter.current().mbps).toBe(24)
  })

  test('nunca desce do mínimo; no mínimo e ainda ruim, cai para 30 quadros', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    run(adapter, lossy, 40)
    expect(adapter.current()).toEqual({ mbps: 7.5, fps: 30 })
  })

  test('volta aos poucos ao teto quando a rede melhora, e recupera os quadros por último', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    run(adapter, lossy, 40)
    run(adapter, clean, 5)
    expect(adapter.current().mbps).toBeCloseTo(8.3, 1)
    run(adapter, clean, 200)
    expect(adapter.current()).toEqual({ mbps: 30, fps: 60 })
  })

  test('processador no limite por 3 s cai para 30 quadros, sem mexer na taxa', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    run(adapter, { ...clean, limitation: 'cpu' }, 2)
    expect(adapter.current().fps).toBe(60)
    expect(adapter.next({ ...clean, limitation: 'cpu' })).toEqual({ mbps: 30, fps: 30 })
  })

  test('mudar o perfil à mão vira o novo teto na hora', () => {
    const adapter = createAdapter({ mbps: 30, fps: 60 })
    run(adapter, lossy, 4)
    adapter.setCeiling({ mbps: 60, fps: 60 })
    expect(adapter.current()).toEqual({ mbps: 60, fps: 60 })
  })
})

describe('leitura do getStats', () => {
  test('pega perda e ida e volta do relatório de quem mostra, e o limite do codificador', () => {
    const entries: StatEntry[] = [
      {
        id: 'o',
        type: 'outbound-rtp',
        kind: 'video',
        timestamp: 0,
        qualityLimitationReason: 'bandwidth'
      },
      {
        id: 'r',
        type: 'remote-inbound-rtp',
        kind: 'video',
        timestamp: 0,
        fractionLost: 0.03,
        roundTripTime: 0.012
      }
    ]
    expect(netSignal(entries)).toEqual({ lossFraction: 0.03, rttMs: 12, limitation: 'bandwidth' })
  })

  test('sem relatório ainda, devolve nulos', () => {
    expect(netSignal([])).toEqual({ lossFraction: null, rttMs: null, limitation: null })
  })
})
