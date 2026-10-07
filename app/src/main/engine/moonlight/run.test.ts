import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForExit } from './run'

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

function fake(): {
  kills: number
  exit(code: number | null): void
  child: Parameters<typeof waitForExit>[0]
} {
  let listener: (code: number | null) => void = () => undefined
  const state = {
    kills: 0,
    exit: (code: number | null) => listener(code),
    child: {
      kill: () => void state.kills++,
      onExit: (l: (code: number | null) => void) => void (listener = l)
    }
  }
  return state
}

describe('waitForExit', () => {
  it('devolve o código quando o processo termina a tempo', async () => {
    const p = fake()
    const result = waitForExit(p.child, 1000)
    p.exit(0)
    expect(await result).toBe(0)
    expect(p.kills).toBe(0)
  })

  it('passou do limite: encerra o processo e devolve null', async () => {
    const p = fake()
    const result = waitForExit(p.child, 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await result).toBeNull()
    expect(p.kills).toBe(1)
  })

  it('erro ao abrir o processo conta como não concluído', async () => {
    const p = fake()
    let fail: () => void = () => undefined
    const result = waitForExit(p.child, 1000, (l) => (fail = l))
    fail()
    expect(await result).toBeNull()
  })
})
