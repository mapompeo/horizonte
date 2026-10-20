import { reportDisplayLoss } from '../../core/display-loss'
import { describe, expect, it, vi } from 'vitest'
import { createController, type Controller } from '../../core/controller'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { composeEngine } from '../compose'
import { FakeEngine } from '../fake'
import type { EngineInstaller, VirtualDisplay } from '../../platform/types'
import { SunshineEngine } from './engine'
import { FakeSunshineProcess } from './testing/fake-process'

function harness(): {
  server: SunshineEngine
  process: FakeSunshineProcess
  installer: { ensureInstalled: ReturnType<typeof vi.fn<EngineInstaller['ensureInstalled']>> }
  lost: ReturnType<typeof vi.fn<(cause: Error) => void>>
  lose(): void
  setController(value: Controller): void
} {
  const process = new FakeSunshineProcess()
  let lose: (cause: Error) => void = () => undefined
  let id = 0
  const display: VirtualDisplay = {
    onLost: (listener) => {
      lose = listener
      return () => {
        lose = () => undefined
      }
    },
    ensureVirtualDisplay: async () => {
      process.displays = [
        process.displays[0],
        { deviceId: `virtual-${++id}`, friendlyName: 'Horizonte', originX: 1920 }
      ]
      // O log do Sunshine so muda no restart: a tela nova nao esta no log anterior.
    },
    isVirtual: (item) => item.friendlyName === 'Horizonte'
  }
  let controller: Controller | undefined
  const lost = vi.fn((cause: Error) => {
    if (controller) reportDisplayLoss(controller, cause)
  })
  const installer = {
    ensureInstalled: vi.fn<import('../../platform/types').EngineInstaller['ensureInstalled']>(
      async () => undefined
    )
  }
  const server = new SunshineEngine({
    installer,
    display,
    memory: { load: async () => ({ encoder: 'gpu-transcoding' }), save: async () => undefined },
    credentials: async () => ({ username: 'u', password: 'p', port: 47989 }),
    createApi: () => process,
    readLog: () => process.readLog(),
    sleep: async () => process.tick(),
    onDisplayLost: lost,
    timing: { pollMs: 500, restartTimeoutMs: 10000 }
  })
  return {
    server,
    process,
    installer,
    lost,
    lose: () => lose(new Error('helper saiu')),
    setController: (value: Controller) => {
      controller = value
    }
  }
}

describe('perda de tela invalida preparacao do Sunshine', () => {
  it('RETRY depois de Pronto recria tela e descobre ID novo no log atualizado', async () => {
    const t = harness()
    const controller = await createController({
      engine: composeEngine(t.server, new FakeEngine(0)),
      store: {
        load: async () => ({ ...DEFAULT_SETTINGS, mode: 'send' }),
        save: async () => undefined
      }
    })
    t.setController(controller)
    await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'))
    expect(t.process.config.output_name).toBe('virtual-1')
    t.lose()
    expect(controller.getSnapshot().state.screen).toBe('error')
    controller.dispatch({ type: 'RETRY' })
    await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'))
    expect(t.installer.ensureInstalled).toHaveBeenCalledTimes(2)
    expect(t.process.config.output_name).toBe('virtual-2')
    await t.server.abort()
  })

  it('perda cancela geracao pendente e ela nao publica configuracao antiga', async () => {
    const t = harness()
    let release!: () => void
    let entered!: () => void
    const installing = new Promise<void>((resolve) => {
      entered = resolve
    })
    let signal: AbortSignal | undefined
    t.installer.ensureInstalled.mockImplementationOnce(async (...args) => {
      signal = args[1]
      entered()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    const first = t.server.prepare(() => undefined, DEFAULT_SETTINGS)
    await installing
    t.lose()
    const cancelled = signal?.aborted
    release()
    await first
    expect(cancelled).toBe(true)
    expect(t.process.config).toEqual({})
    expect(t.lost).toHaveBeenCalledOnce()
    await t.server.prepare(() => undefined, DEFAULT_SETTINGS)
    expect(t.process.config.output_name).toBe('virtual-1')
    await t.server.abort()
  })
  it('perda em modo receber invalida o cache sem substituir a tela atual', async () => {
    const t = harness()
    const controller = await createController({
      engine: composeEngine(t.server, new FakeEngine(0)),
      store: {
        load: async () => ({ ...DEFAULT_SETTINGS, mode: 'send' }),
        save: async () => undefined
      }
    })
    t.setController(controller)
    await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'))
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    t.lose()
    expect(controller.getSnapshot().state.screen).toBe('discover')
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    await vi.waitFor(() => expect(controller.getSnapshot().state.screen).toBe('ready'))
    expect(t.process.config.output_name).toBe('virtual-2')
    await t.server.abort()
  })
})
