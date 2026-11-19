import { describe, expect, it } from 'vitest'
import { killChildren, liveChildren, spawn } from './children'

describe('processos auxiliares', () => {
  it('o filho aberto pelo spawn do app morre quando o app sai', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    const exited = new Promise<NodeJS.Signals | number | null>((resolve) =>
      child.once('exit', (code, signal) => resolve(signal ?? code))
    )
    expect(liveChildren()).toBe(1)
    killChildren()
    expect(await exited).not.toBe(0)
    expect(child.killed).toBe(true)
    expect(liveChildren()).toBe(0)
  })

  it('filho que terminou sozinho sai da lista', async () => {
    const child = spawn(process.execPath, ['-e', ''])
    await new Promise((resolve) => child.once('exit', resolve))
    expect(liveChildren()).toBe(0)
  })
})
