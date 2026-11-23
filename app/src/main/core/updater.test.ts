import { describe, expect, it, vi } from 'vitest'
import { createUpdater, type UpdateEvents } from './updater'

function setup(
  autoDownload = false,
  log?: (line: string) => void
): {
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
    stop,
    log
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
  it('o código do erro diz o passo: procurar (501), baixar (502), instalar (503)', async () => {
    const t = setup()
    t.events.error(new Error('rede'))
    expect(t.updater.status()).toMatchObject({ phase: 'error', code: '501' })

    await t.updater.perform('check')
    t.download.mockRejectedValueOnce(new Error('ECONNRESET'))
    expect(await t.updater.perform('download')).toMatchObject({ phase: 'error', code: '502' })

    await t.updater.perform('check')
    await t.updater.perform('download')
    t.events.downloaded()
    t.install.mockImplementationOnce(() => t.events.error(new Error('pkexec saiu com 126')))
    expect(await t.updater.perform('install')).toMatchObject({ phase: 'error', code: '503' })
    expect(t.updater.status().message).toContain('Não deu para instalar a atualização')
  })

  it('cada falha fica registrada com o motivo', async () => {
    const lines: string[] = []
    const t = setup(false, (line) => lines.push(line))
    t.events.error(new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(lines).toEqual(['501: net::ERR_INTERNET_DISCONNECTED'])
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
