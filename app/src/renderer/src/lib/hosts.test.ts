import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../shared/types'
import { pollHosts } from './hosts'

const DESKTOP: Host = { name: 'Desktop', address: '192.168.1.5' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(results: Array<Host[] | Error>): {
  seen: Array<{ hosts: Host[]; searching: boolean }>
  calls: () => number
  stop: () => void
} {
  const seen: Array<{ hosts: Host[]; searching: boolean }> = []
  let calls = 0
  const stop = pollHosts(
    async () => {
      const next = results[Math.min(calls, results.length - 1)]!
      calls++
      if (next instanceof Error) throw next
      return next
    },
    (hosts, searching) => seen.push({ hosts, searching }),
    { intervalMs: 1000 }
  )
  return { seen, calls: () => calls, stop }
}

describe('pollHosts', () => {
  it('busca na hora e mostra o que achou, já sem o "procurando"', async () => {
    const t = setup([[DESKTOP]])
    await vi.advanceTimersByTimeAsync(0)
    expect(t.seen.at(-1)).toEqual({ hosts: [DESKTOP], searching: false })
    t.stop()
  })

  it('busca vazia na primeira vez não encerra a busca: tenta de novo e acha', async () => {
    const t = setup([[], [DESKTOP]])
    await vi.advanceTimersByTimeAsync(0)
    expect(t.seen.at(-1)?.hosts).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.seen.at(-1)).toEqual({ hosts: [DESKTOP], searching: false })
    t.stop()
  })

  it('um resultado vazio isolado não faz o aparelho sumir (anúncio que falhou uma vez)', async () => {
    const t = setup([[DESKTOP], [], [DESKTOP]])
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.seen.every((s) => s.hosts.length === 1)).toBe(true)
    t.stop()
  })

  it('dois resultados vazios seguidos tiram o aparelho da lista', async () => {
    const t = setup([[DESKTOP], [], []])
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.seen.at(-1)?.hosts).toEqual([])
    t.stop()
  })

  it('erro na busca não derruba nada: segue tentando', async () => {
    const t = setup([new Error('rede'), [DESKTOP]])
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.seen.at(-1)?.hosts).toEqual([DESKTOP])
    t.stop()
  })

  it('parar com uma busca ainda em andamento descarta o resultado dela', async () => {
    let finish: (hosts: Host[]) => void = () => undefined
    const updates: Host[][] = []
    const stop = pollHosts(
      () => new Promise<Host[]>((resolve) => (finish = resolve)),
      (hosts) => updates.push(hosts),
      { intervalMs: 1000 }
    )
    await vi.advanceTimersByTimeAsync(0)
    stop()
    finish([DESKTOP])
    await vi.advanceTimersByTimeAsync(5000)
    expect(updates).toEqual([])
  })

  it('ao parar, nada mais é buscado nem avisado', async () => {
    const t = setup([[DESKTOP]])
    await vi.advanceTimersByTimeAsync(0)
    const before = t.calls()
    const count = t.seen.length
    t.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.calls()).toBe(before)
    expect(t.seen).toHaveLength(count)
  })
})
