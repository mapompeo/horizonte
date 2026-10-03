import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPairingWatcher, type PairingWatcher } from './pairing-watcher'
import type { Pairing } from './api'

const notebook: Pairing = { id: 'p1', name: 'Notebook', address: '192.168.1.2' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

interface Harness {
  watcher: PairingWatcher
  requests: Pairing[]
  cancelled: string[]
  errors: unknown[]
  calls: () => number
  release: (list: Pairing[]) => void
}

function setup(responses: Array<Pairing[] | Error | 'pending'>): Harness {
  const requests: Pairing[] = []
  const cancelled: string[] = []
  const errors: unknown[] = []
  let calls = 0
  let release: ((list: Pairing[]) => void) | null = null
  const api = {
    listPairings: (): Promise<Pairing[]> => {
      const response = responses[Math.min(calls, responses.length - 1)]
      calls++
      if (response === 'pending') {
        return new Promise((resolve) => {
          release = resolve
        })
      }
      if (response instanceof Error) return Promise.reject(response)
      return Promise.resolve(response ?? [])
    }
  }
  const watcher = createPairingWatcher({
    api,
    intervalMs: 100,
    maxBackoffMs: 400,
    onRequest: (pairing) => requests.push(pairing),
    onCancelled: (id) => cancelled.push(id),
    onError: (cause) => errors.push(cause)
  })
  return {
    watcher,
    requests,
    cancelled,
    errors,
    calls: () => calls,
    release: (list: Pairing[]) => release?.(list)
  }
}

describe('createPairingWatcher', () => {
  it('avisa uma vez só de um pedido que aparece em várias consultas', async () => {
    const t = setup([[notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.requests).toEqual([notebook])
    expect(t.calls()).toBeGreaterThan(2)
    t.watcher.stop()
  })

  it('avisa o cancelamento quando o pedido some', async () => {
    const t = setup([[notebook], []])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    expect(t.requests).toEqual([notebook])
    expect(t.cancelled).toEqual(['p1'])
    t.watcher.stop()
  })

  it('o mesmo identificador voltando depois de sumir é um pedido novo', async () => {
    const t = setup([[notebook], [], [notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(t.requests).toEqual([notebook, notebook])
    t.watcher.stop()
  })

  it('uma consulta lenta não se sobrepõe à seguinte', async () => {
    const t = setup(['pending'])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.calls()).toBe(1)
    t.release([notebook])
    await vi.advanceTimersByTimeAsync(0)
    expect(t.requests).toEqual([notebook])
    t.watcher.stop()
  })

  it('erros não param a vigilância e o intervalo cresce até o limite', async () => {
    const t = setup([new Error('fora do ar')])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls()).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(t.calls()).toBe(2)
    await vi.advanceTimersByTimeAsync(400)
    expect(t.calls()).toBe(3)
    await vi.advanceTimersByTimeAsync(400)
    expect(t.calls()).toBe(4)
    expect(t.errors).toHaveLength(4)
    t.watcher.stop()
  })

  it('depois de um erro, uma consulta boa volta ao ritmo normal', async () => {
    const t = setup([new Error('x'), [notebook]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(t.requests).toEqual([notebook])
    const before = t.calls()
    await vi.advanceTimersByTimeAsync(100)
    expect(t.calls()).toBe(before + 1)
    t.watcher.stop()
  })

  it('parar com uma consulta em andamento ignora o resultado dela', async () => {
    const t = setup(['pending'])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    t.watcher.stop()
    t.release([notebook])
    await vi.advanceTimersByTimeAsync(500)
    expect(t.requests).toEqual([])
    expect(t.calls()).toBe(1)
  })

  it('um callback que lança não derruba a vigilância', async () => {
    const errors: unknown[] = []
    let calls = 0
    const watcher = createPairingWatcher({
      api: {
        listPairings: async () => {
          calls++
          return [notebook]
        }
      },
      intervalMs: 100,
      onRequest: () => {
        throw new Error('callback quebrado')
      },
      onCancelled: () => undefined,
      onError: (cause) => errors.push(cause)
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(calls).toBeGreaterThan(2)
    expect(errors).toHaveLength(1)
    watcher.stop()
  })

  it('começar duas vezes não duplica as consultas', async () => {
    const t = setup([[]])
    t.watcher.start()
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls()).toBe(1)
    t.watcher.stop()
  })

  it('depois de parar, nada mais é consultado', async () => {
    const t = setup([[]])
    t.watcher.start()
    await vi.advanceTimersByTimeAsync(250)
    t.watcher.stop()
    const before = t.calls()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.calls()).toBe(before)
  })
})
