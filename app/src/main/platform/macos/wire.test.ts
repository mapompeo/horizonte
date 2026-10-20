import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMacPlatform } from './wire'

const children = vi.hoisted(() => [] as Array<ReturnType<typeof child>>)
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  existsSync: () => true
}))
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: () => {
    const proc = child()
    children.push(proc)
    return proc
  }
}))
vi.mock('./setup', async (original) => ({
  ...(await original<typeof import('./setup')>()),
  createMacSetup: (deps: import('./setup').MacSetupDeps) => ({
    installer: { ensureInstalled: async () => undefined },
    display: { ensureVirtualDisplay: () => deps.startVirtualDisplay!(), isVirtual: () => true }
  })
}))
type FakeChild = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}
function child(): FakeChild {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  return proc
}
const exits = process.listeners('exit')
afterEach(() => {
  for (const listener of process.listeners('exit'))
    if (!exits.includes(listener)) process.removeListener('exit', listener)
  children.length = 0
})
function platform(): ReturnType<typeof createMacPlatform> {
  return createMacPlatform({
    userData: 'unused',
    helperPath: '/helper',
    sleep: async () => undefined,
    cipher: {
      isAvailable: () => true,
      encrypt: (s) => Buffer.from(s),
      decrypt: (b) => b.toString()
    }
  })
}
const ready = (proc: ReturnType<typeof child>, id = 7): boolean =>
  proc.stdout.emit('data', Buffer.from(`DISPLAY_ID ${id}\n`))

describe('vida do helper no adaptador Mac', () => {
  it('propaga perda apos pronto e permite recriar', async () => {
    const mac = platform()
    const lost = vi.fn()
    mac.display.onLost!(lost)
    const first = mac.display.ensureVirtualDisplay()
    ready(children[0])
    await first
    children[0].emit('exit', null, 'SIGKILL')
    expect(lost).toHaveBeenCalledOnce()
    expect(lost.mock.calls[0][0].message).toContain('SIGKILL')
    const second = mac.display.ensureVirtualDisplay()
    ready(children[1], 8)
    await second
    mac.stopVirtualDisplay()
  })

  it('saida de helper antigo nao apaga nem acusa perda do novo', async () => {
    const mac = platform()
    const lost = vi.fn()
    mac.display.onLost!(lost)
    const first = mac.display.ensureVirtualDisplay()
    ready(children[0])
    await first
    mac.stopVirtualDisplay()
    const second = mac.display.ensureVirtualDisplay()
    ready(children[1], 8)
    await second
    children[0].emit('exit', 0)
    await mac.display.ensureVirtualDisplay()
    expect(children).toHaveLength(2)
    expect(lost).not.toHaveBeenCalled()
    mac.stopVirtualDisplay()
  })

  it('morte logo apos DISPLAY_ID nao publica helper morto', async () => {
    const mac = platform()
    const first = mac.display.ensureVirtualDisplay()
    const rejected = expect(first).rejects.toThrow()
    ready(children[0])
    children[0].emit('exit', 3)
    await rejected
    const second = mac.display.ensureVirtualDisplay()
    ready(children[1], 8)
    await second
    mac.stopVirtualDisplay()
  })
  it('chamadas concorrentes compartilham um helper', async () => {
    const mac = platform()
    const first = mac.display.ensureVirtualDisplay()
    const second = mac.display.ensureVirtualDisplay()
    ready(children[0])
    await Promise.all([first, second])
    expect(children).toHaveLength(1)
    mac.stopVirtualDisplay()
  })

  it('stop durante abertura nao publica helper que chega depois nem afeta nova geracao', async () => {
    const mac = platform()
    const lost = vi.fn()
    mac.display.onLost!(lost)
    const first = mac.display.ensureVirtualDisplay()
    const rejected = expect(first).rejects.toThrow('cancelada')
    mac.stopVirtualDisplay()
    const killedWhileOpening = children[0].kill.mock.calls.length
    const second = mac.display.ensureVirtualDisplay()
    expect(children).toHaveLength(1)
    children[0].emit('exit', 0)
    await rejected
    await vi.waitFor(() => expect(children).toHaveLength(2))
    ready(children[1], 8)
    await second
    children[0].emit('exit', 0)
    await mac.display.ensureVirtualDisplay()
    expect(children).toHaveLength(2)
    expect(killedWhileOpening).toBe(1)
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM')
    expect(lost).not.toHaveBeenCalled()
    mac.stopVirtualDisplay()
  })
})
