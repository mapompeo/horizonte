import { describe, expect, it, vi } from 'vitest'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import { createMacSetup, ONE_SCREEN_MESSAGE, type MacSetupDeps } from './setup'
import { sunshineDmgFor } from './versions'
import { countDisplays } from './wire'

describe('sunshineDmgFor', () => {
  it('escolhe o pacote do processador, com hash fixo', () => {
    expect(sunshineDmgFor('arm64').fileName).toBe('Sunshine-macOS-arm64.dmg')
    expect(sunshineDmgFor('x64').sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('processador desconhecido é recusado com uma frase clara', () => {
    expect(() => sunshineDmgFor('ia32')).toThrow(/processador/)
  })
})

interface Harness {
  deps: MacSetupDeps
  scripts: string[]
  download: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

function harness(
  options: { installed?: boolean; responding?: boolean; stored?: boolean; screens?: number } = {}
): Harness {
  const scripts: string[] = []
  const download = vi.fn(async () => undefined)
  const save = vi.fn(async () => undefined)
  const deps: MacSetupDeps = {
    probe: {
      sunshineInstalled: async () => options.installed ?? false,
      sunshineResponding: async () => options.responding ?? false,
      displayCount: async () => options.screens ?? 2
    },
    vault: {
      load: async () =>
        options.stored ? { username: 'horizonte', password: 'velha', port: 47989 } : null,
      save
    },
    download,
    run: async (script) => void scripts.push(script),
    dmgForThisMac: () => sunshineDmgFor('arm64'),
    waitForApi: async () => undefined,
    generatePassword: () => 'senha-nova',
    workDir: '/tmp',
    appsDir: '/Users/ana/Applications',
    port: 47989
  }
  return { deps, scripts, download, save }
}

const display = (primary: boolean): SunshineDisplay => ({
  deviceId: '1',
  displayName: 'd',
  friendlyName: 'd',
  width: 1920,
  height: 1080,
  primary,
  originX: 0
})

describe('createMacSetup', () => {
  it('Mac limpo: baixa, copia o app para ~/Applications sem administrador, guarda a senha e liga', async () => {
    const h = harness()
    await createMacSetup(h.deps).installer.ensureInstalled()

    expect(h.download).toHaveBeenCalledOnce()
    const all = h.scripts.join('\n')
    expect(all).toContain('hdiutil attach')
    expect(all).toContain('cp -R "$mnt/Sunshine.app" \'/Users/ana/Applications/Sunshine.app\'')
    expect(all).toContain("--creds 'horizonte' 'senha-nova'")
    expect(all).toContain("open '/Users/ana/Applications/Sunshine.app'")
    expect(all).not.toMatch(/sudo|osascript|administrator/i)
    expect(h.save).toHaveBeenCalledWith({
      username: 'horizonte',
      password: 'senha-nova',
      port: 47989
    })
  })

  it('já instalado e respondendo: não faz nada', async () => {
    const h = harness({ installed: true, responding: true, stored: true })
    await createMacSetup(h.deps).installer.ensureInstalled()
    expect(h.scripts).toEqual([])
    expect(h.download).not.toHaveBeenCalled()
  })

  it('instalado mas parado: só abre o app, sem baixar nem trocar a senha', async () => {
    const h = harness({ installed: true, stored: true })
    await createMacSetup(h.deps).installer.ensureInstalled()
    expect(h.download).not.toHaveBeenCalled()
    expect(h.save).not.toHaveBeenCalled()
    expect(h.scripts.join('\n')).toContain('open ')
  })

  it('Mac com uma tela só: explica o que fazer e não instala nada', async () => {
    const h = harness({ screens: 1 })
    await expect(createMacSetup(h.deps).installer.ensureInstalled()).rejects.toThrow(
      ONE_SCREEN_MESSAGE
    )
    expect(h.download).not.toHaveBeenCalled()
    expect(h.scripts).toEqual([])
  })

  it('o monitor "virtual" é qualquer tela que não seja a principal', () => {
    const { display: d } = createMacSetup(harness().deps)
    expect(d.isVirtual(display(false))).toBe(true)
    expect(d.isVirtual(display(true))).toBe(false)
  })
})

describe('countDisplays', () => {
  it('conta uma tela por linha Resolution do relatório do sistema', () => {
    const report = [
      'Displays:',
      '  Color LCD:',
      '    Resolution: 3024 x 1964',
      '  DELL:',
      '    Resolution: 1920 x 1080'
    ].join('\n')
    expect(countDisplays(report)).toBe(2)
    expect(countDisplays('Graphics/Displays:')).toBe(0)
  })
})
