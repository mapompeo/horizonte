import { describe, expect, it } from 'vitest'
import { composeEngine } from './compose'
import { FakeEngine } from './fake'
import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../core/settings'

const settings: Settings = { ...DEFAULT_SETTINGS }

describe('composeEngine', () => {
  it('manda o papel de servidor ao servidor e o de cliente ao cliente', async () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    const engine = composeEngine(server, client)

    await engine.prepare(() => undefined, settings)
    await engine.approve({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    await engine.deny('p2')
    await engine.stopSending()
    await engine.abort()
    await engine.listHosts()
    await engine.connect('192.168.1.3', settings)
    await engine.disconnect()

    expect(server.calls).toEqual(['prepare', 'approve', 'deny', 'stopSending', 'abort'])
    expect(client.calls).toEqual(['connect:192.168.1.3', 'disconnect'])
  })

  it('junta os eventos de cada lado', () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    const engine = composeEngine(server, client)
    const seen: string[] = []
    engine.onPairRequest((request) => seen.push(`pair:${request.pairingId}`))
    engine.onPairCancelled((id) => seen.push(`cancel:${id}`))
    engine.onClientConnected((device) => seen.push(`connected:${device}`))
    engine.onClientDisconnected(() => seen.push('disconnected'))
    engine.onStreamEnded(() => seen.push('ended'))

    server.simulatePairRequest('Notebook', 'p1')
    server.simulatePairCancelled('p1')
    server.simulateClientConnected('Notebook')
    server.simulateClientDisconnected()
    client.simulateStreamEnded()
    client.simulateClientConnected('ignorado')

    expect(seen).toEqual(['pair:p1', 'cancel:p1', 'connected:Notebook', 'disconnected', 'ended'])
  })

  it('quem cancela a assinatura deixa de receber', () => {
    const server = new FakeEngine(0)
    const engine = composeEngine(server, new FakeEngine(0))
    let count = 0
    const stop = engine.onPairRequest(() => count++)
    server.simulatePairRequest('A')
    stop()
    server.simulatePairRequest('B')
    expect(count).toBe(1)
  })

  it('o ajuste de bitrate vai aos dois lados e uma falha de um não derruba o outro', async () => {
    const server = new FakeEngine(0)
    const client = new FakeEngine(0)
    server.applyBitrate = async () => {
      throw new Error('servidor parado')
    }
    const engine = composeEngine(server, client)
    await expect(engine.applyBitrate(40)).resolves.toBeUndefined()
    expect(client.calls).toContain('bitrate:40')
  })
})
