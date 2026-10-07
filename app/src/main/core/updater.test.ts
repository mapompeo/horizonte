import { describe, expect, it, vi } from 'vitest'
import { createUpdater, type UpdateEvents } from './updater'

function setup(): {
  updater: ReturnType<typeof createUpdater>
  events: UpdateEvents
  install: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  busy(): void
} {
  let events!: UpdateEvents
  let idle = true
  const install = vi.fn()
  const download = vi.fn(async () => undefined)
  const updater = createUpdater({
    supported: true,
    currentVersion: '0.1.0-beta.9',
    listen: (value) => {
      events = value
    },
    check: async () => {
      events.available('0.1.0-beta.10')
    },
    download,
    install,
    canInstall: () => idle
  })
  return {
    updater,
    events,
    install,
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
  it('não instala durante uma conexão nem antes de baixar', async () => {
    const t = setup()
    await t.updater.perform('install')
    expect(t.install).not.toHaveBeenCalled()
    t.events.downloaded()
    t.busy()
    expect(await t.updater.perform('install')).toMatchObject({ phase: 'ready' })
    expect(t.install).not.toHaveBeenCalled()
  })
  it('instala somente o pacote já baixado quando o app está livre', async () => {
    const t = setup()
    t.events.downloaded()
    await t.updater.perform('install')
    expect(t.install).toHaveBeenCalledOnce()
  })
})
