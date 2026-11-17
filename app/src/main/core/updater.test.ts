import { describe, expect, it, vi } from 'vitest'
import { createUpdater, type UpdateEvents } from './updater'

function setup(autoDownload = false): {
  updater: ReturnType<typeof createUpdater>
  events: UpdateEvents
  install: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  busy(): void
} {
  let events!: UpdateEvents
  let idle = true
  const install = vi.fn()
  const stop = vi.fn()
  const download = vi.fn(async () => undefined)
  const updater = createUpdater({
    supported: true,
    autoDownload,
    currentVersion: '0.1.0-beta.9',
    listen: (value) => {
      events = value
    },
    check: async () => {
      events.available('0.1.0-beta.10')
    },
    download,
    install,
    canInstall: () => idle,
    stop
  })
  return {
    updater,
    events,
    install,
    stop,
    download,
    busy: () => {
      idle = false
    }
  }
}

describe('atualização', () => {
  it('checa sem baixar e só baixa sob comando explícito', async () => {
    const t = setup()
    expect(await t.updater.perform('check')).toMatchObject({
      phase: 'available',
      version: '0.1.0-beta.10'
    })
    expect(t.download).not.toHaveBeenCalled()
    await t.updater.perform('download')
    expect(t.download).toHaveBeenCalledOnce()
    t.events.progress(42)
    expect(t.updater.status().percent).toBe(42)
    t.events.downloaded()
    expect(t.updater.status().phase).toBe('ready')
  })
  it('não instala antes de baixar; durante uma conexão, encerra ela sozinho e instala', async () => {
    const t = setup()
    await t.updater.perform('install')
    expect(t.install).not.toHaveBeenCalled()
    t.events.downloaded()
    t.busy()
    await t.updater.perform('install')
    expect(t.stop).toHaveBeenCalledOnce()
    expect(t.install).toHaveBeenCalledOnce()
    expect(t.stop.mock.invocationCallOrder[0]).toBeLessThan(t.install.mock.invocationCallOrder[0])
  })
  it('instala somente o pacote já baixado quando o app está livre', async () => {
    const t = setup()
    t.events.downloaded()
    await t.updater.perform('install')
    expect(t.install).toHaveBeenCalledOnce()
    expect(t.stop).not.toHaveBeenCalled()
  })
  it('sozinho, baixa ao achar versão nova e depois só falta reiniciar', async () => {
    const t = setup(true)
    expect(await t.updater.perform('check')).toMatchObject({
      phase: 'downloading',
      version: '0.1.0-beta.10'
    })
    expect(t.download).toHaveBeenCalledOnce()
    t.events.downloaded()
    expect(await t.updater.perform('check')).toMatchObject({ phase: 'ready' })
    t.events.available('0.1.0-beta.10')
    expect(t.download).toHaveBeenCalledOnce()
    expect(t.updater.status().phase).toBe('ready')
  })
})
