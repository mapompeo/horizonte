import { describe, expect, it, vi } from 'vitest'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutostart, desktopEntry } from './autostart'

describe('autostart', () => {
  it('Linux grava e remove apenas a entrada do Horizonte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'horizonte-autostart-'))
    try {
      const start = createAutostart({
        platform: 'linux',
        executable: '/app/Horizonte',
        configDir: dir,
        native: () => {
          throw new Error('API nativa não existe no Linux')
        }
      })
      const file = join(dir, 'autostart', 'horizonte.desktop')
      const legacy = join(dir, 'autostart', 'com.horizonte.app.desktop')
      await mkdir(join(dir, 'autostart'), { recursive: true })
      await writeFile(legacy, '[Desktop Entry]\n')
      await start.set(true)
      // Mesmo nome e ícone do atalho instalado, e o arquivo antigo (que virava um segundo app) some.
      expect(await readFile(file, 'utf8')).toContain('Exec="/app/Horizonte"')
      expect(await readFile(file, 'utf8')).toContain('Icon=horizonte')
      await expect(readFile(legacy)).rejects.toMatchObject({ code: 'ENOENT' })
      await start.set(false)
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('Linux troca o link para o atalho do sistema (sem permissão) por um arquivo próprio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'horizonte-autostart-'))
    try {
      const system = join(dir, 'sistema.desktop')
      await writeFile(system, '[Desktop Entry]\n')
      await chmod(system, 0o444)
      const file = join(dir, 'autostart', 'horizonte.desktop')
      await mkdir(join(dir, 'autostart'), { recursive: true })
      await symlink(system, file)
      const start = createAutostart({
        platform: 'linux',
        executable: '/app/Horizonte',
        configDir: dir,
        native: () => undefined
      })
      await start.set(true)
      expect((await lstat(file)).isSymbolicLink()).toBe(false)
      expect(await readFile(file, 'utf8')).toContain('Exec="/app/Horizonte"')
      expect(await readFile(system, 'utf8')).toBe('[Desktop Entry]\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('aplica a preferência pela API nativa no Windows e Mac', async () => {
    for (const platform of ['win32', 'darwin']) {
      const native = vi.fn()
      const start = createAutostart({
        platform,
        executable: '/app/Horizonte',
        configDir: '/config',
        native
      })
      await start.set(true)
      await start.set(false)
      expect(native.mock.calls).toEqual([[true], [false]])
    }
  })
  it('escapa campos e caracteres especiais sem criar outra entrada', () => {
    expect(desktopEntry('/app/Meu Horizonte%app')).toContain('Exec="/app/Meu Horizonte%%app"')
    expect(() => desktopEntry('/app/\nHidden=false')).toThrow()
  })
})
