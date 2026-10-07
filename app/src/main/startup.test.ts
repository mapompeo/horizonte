import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createAutostart } from './platform/autostart'
import { finishStartup, runStartup } from './startup'

describe('finishStartup', () => {
  it('autostart sem permissão não impede a janela e preserva causa no erro acionável', async () => {
    const cause = Object.assign(
      new Error('EROFS: read-only file system, mkdir /config/autostart'),
      { code: 'EROFS' }
    )
    const open = vi.fn()
    const errors: Error[] = []
    await expect(
      finishStartup({
        createWindow: open,
        syncAutostart: async () => {
          throw cause
        },
        reportError: (error) => errors.push(error)
      })
    ).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(1)
    expect(errors[0].cause).toBe(cause)
    expect(errors[0].message).toMatch(/permissões/i)
    expect(errors[0].message).toMatch(/Ajustes/)
  })

  it('abre a janela antes de aguardar uma sincronização lenta', async () => {
    let finish!: () => void
    const sync = new Promise<void>((resolve) => {
      finish = resolve
    })
    const open = vi.fn()
    const errors = vi.fn()
    const pending = finishStartup({
      createWindow: open,
      syncAutostart: () => sync,
      reportError: errors
    })
    const opened = open.mock.calls.length
    finish()
    await pending
    expect(opened).toBe(1)
    expect(errors).not.toHaveBeenCalled()
  })

  it('falha real de filesystem no autostart Linux mantém a janela disponível', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hz-startup-'))
    try {
      const config = join(dir, 'config')
      await writeFile(config, 'arquivo, não diretório')
      const autostart = createAutostart({
        platform: 'linux',
        executable: '/opt/Horizonte.AppImage',
        configDir: config,
        native: () => undefined
      })
      const open = vi.fn()
      const errors: Error[] = []
      await expect(
        finishStartup({
          createWindow: open,
          syncAutostart: () => autostart.set(true),
          reportError: (error) => errors.push(error)
        })
      ).resolves.toBeUndefined()
      expect(open).toHaveBeenCalledOnce()
      expect(errors[0].cause).toBeInstanceOf(Error)
      expect((errors[0].cause as NodeJS.ErrnoException).code).toBeTruthy()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('sem sincronização de autostart abre normalmente sem aviso', async () => {
    const open = vi.fn()
    const errors = vi.fn()
    await finishStartup({ createWindow: open, reportError: errors })
    expect(open).toHaveBeenCalledOnce()
    expect(errors).not.toHaveBeenCalled()
  })
})

describe('runStartup', () => {
  it('janela falhando vira erro fatal sem tentar configurar autostart', async () => {
    const cause = new Error('BrowserWindow indisponível')
    const sync = vi.fn(async () => undefined)
    const quit = vi.fn()
    const errors: Error[] = []
    await expect(
      runStartup(
        () =>
          finishStartup({
            createWindow: () => {
              throw cause
            },
            syncAutostart: sync,
            reportError: () => {
              throw new Error('falha fatal não é aviso')
            }
          }),
        (error) => {
          errors.push(error)
          quit()
        }
      )
    ).resolves.toBeUndefined()
    expect(errors[0].cause).toBe(cause)
    expect(sync).not.toHaveBeenCalled()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('rejeição fatal do boot é tratada com a causa original em vez de ficar solta', async () => {
    const cause = new Error('EACCES: permission denied, open settings.json')
    const errors: Error[] = []
    await expect(
      runStartup(
        async () => {
          throw cause
        },
        (error) => errors.push(error)
      )
    ).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0].cause).toBe(cause)
    expect(errors[0].message).toMatch(/permissões/i)
  })

  it('boot bem sucedido não apresenta erro', async () => {
    const errors = vi.fn()
    await runStartup(async () => undefined, errors)
    expect(errors).not.toHaveBeenCalled()
  })
})
