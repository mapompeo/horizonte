import { describe, expect, it, vi } from 'vitest'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import {
  createMacSetup,
  ONE_SCREEN_MESSAGE,
  VIRTUAL_DISPLAY_FAILED_MESSAGE,
  type MacSetupDeps
} from './setup'
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
  helperStarts: () => number
}

function harness(
  options: {
    installed?: boolean
    responding?: boolean
    stored?: boolean
    screens?: number
    /** Com o auxiliar: quantas telas existem depois de ele criar o monitor (a de antes é `screens`). */
    helper?: { screensAfter: number } | { fails: string }
  } = {}
): Harness {
  const scripts: string[] = []
  const download = vi.fn(async () => undefined)
  const save = vi.fn(async () => undefined)
  let screens = options.screens ?? 2
  let helperStarts = 0
  const deps: MacSetupDeps = {
    probe: {
      sunshineInstalled: async () => options.installed ?? false,
      sunshineResponding: async () => options.responding ?? false,
      displayCount: async () => screens
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
    sleep: async () => undefined,
    startVirtualDisplay: options.helper
      ? async () => {
          helperStarts++
          if ('fails' in options.helper!) throw new Error(options.helper.fails)
          screens = options.helper!.screensAfter
        }
      : undefined,
    workDir: '/tmp',
    appsDir: '/Users/ana/Applications',
    port: 47989
  }
  return { deps, scripts, download, save, helperStarts: () => helperStarts }
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
  it('monitor com sinal já cancelado não inicia sondagens', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()
    let probes = 0
    h.deps.probe.sunshineInstalled = async () => {
      probes++
      return false
    }
    await expect(
      createMacSetup(h.deps).display.ensureVirtualDisplay(controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(probes).toBe(0)
  })

  it('cancelar durante auxiliar preserva AbortError e não instala', async () => {
    const h = harness({ screens: 1 })
    const controller = new AbortController()
    h.deps.startVirtualDisplay = async () => {
      controller.abort()
    }
    await expect(
      createMacSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.download).not.toHaveBeenCalled()
    expect(h.scripts).toEqual([])
  })

  it('cancelar durante gravação impede restart', async () => {
    const h = harness({ installed: true })
    const controller = new AbortController()
    h.deps.vault.save = async () => {
      controller.abort()
    }
    await expect(
      createMacSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.scripts).toHaveLength(1)
    expect(h.scripts[0]).toContain('--creds')
  })

  it('cancelar interrompe download pendente pelo quarto argumento', async () => {
    const h = harness()
    const controller = new AbortController()
    let entered!: () => void
    const downloading = new Promise<void>((resolve) => {
      entered = resolve
    })
    h.deps.download = async (_artifact, _dest, _progress, signal) => {
      entered()
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        if (!signal) reject(new Error('download sem sinal'))
      })
    }
    const pending = createMacSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    await failure
    expect(h.scripts).toEqual([])
    expect(h.save).not.toHaveBeenCalled()
  })

  it('cancelar após instalação impede credenciais e restart', async () => {
    const h = harness()
    const controller = new AbortController()
    h.deps.run = async (script) => {
      h.scripts.push(script)
      controller.abort()
    }
    await expect(
      createMacSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.scripts).toHaveLength(1)
    expect(h.scripts[0]).not.toContain('--creds')
    expect(h.save).not.toHaveBeenCalled()
  })

  it('cancelar no progresso impede instalação', async () => {
    const h = harness()
    const controller = new AbortController()
    await expect(
      createMacSetup(h.deps).installer.ensureInstalled((p) => {
        if (p.note.startsWith('Instalando')) controller.abort()
      }, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.scripts).toEqual([])
  })

  it('cancelar após comando de credenciais impede gravação e restart', async () => {
    const h = harness({ installed: true })
    const controller = new AbortController()
    h.deps.run = async (script) => {
      h.scripts.push(script)
      controller.abort()
    }
    await expect(
      createMacSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.scripts).toHaveLength(1)
    expect(h.scripts[0]).toContain('--creds')
    expect(h.save).not.toHaveBeenCalled()
  })

  it('nova tentativa não herda sucesso da operação cancelada', async () => {
    const h = harness()
    const controller = new AbortController()
    let entered!: () => void
    let finish!: () => void
    const downloading = new Promise<void>((resolve) => {
      entered = resolve
    })
    let downloads = 0
    h.deps.download = async () => {
      if (++downloads === 1) {
        entered()
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      }
    }
    const setup = createMacSetup(h.deps)
    const first = setup.installer.ensureInstalled(undefined, controller.signal)
    const failure = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    const second = setup.display.ensureVirtualDisplay()
    finish()
    await failure
    await second
    expect(downloads).toBe(2)
    expect(h.scripts.filter((script) => script.includes('hdiutil attach'))).toHaveLength(1)
  })

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

  it('o executável e o processo do Sunshine no Mac se chamam "Sunshine" (visto num Mac real, na CI)', async () => {
    const h = harness()
    await createMacSetup(h.deps).installer.ensureInstalled()
    const all = h.scripts.join('\n')
    // Em disco sensível a maiúsculas "sunshine" não existe, e o pkill com o nome errado não encerra nada.
    expect(all).toContain("'/Users/ana/Applications/Sunshine.app/Contents/MacOS/Sunshine' --creds")
    expect(all).toContain('pkill -x Sunshine')
    expect(all).not.toMatch(/pkill -x sunshine/)
    expect(all).not.toContain('MacOS/sunshine')
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

  it('Mac com uma tela só e o auxiliar do Horizonte: cria o monitor virtual e só então instala', async () => {
    const h = harness({ screens: 1, helper: { screensAfter: 2 } })
    await createMacSetup(h.deps).installer.ensureInstalled()
    expect(h.helperStarts()).toBe(1)
    expect(h.download).toHaveBeenCalledOnce()
  })

  it('Mac com duas telas ou mais: nem liga o auxiliar', async () => {
    const h = harness({ screens: 2, helper: { screensAfter: 3 } })
    await createMacSetup(h.deps).installer.ensureInstalled()
    expect(h.helperStarts()).toBe(0)
  })

  it('o auxiliar roda mas o macOS não mostra a tela nova: explica e não instala nada', async () => {
    const h = harness({ screens: 1, helper: { screensAfter: 1 } })
    await expect(createMacSetup(h.deps).installer.ensureInstalled()).rejects.toThrow(
      VIRTUAL_DISPLAY_FAILED_MESSAGE
    )
    expect(h.download).not.toHaveBeenCalled()
  })

  it('o auxiliar falha ao iniciar: explica com o que o sistema disse e não instala nada', async () => {
    const h = harness({ screens: 1, helper: { fails: 'o macOS recusou criar o monitor virtual' } })
    const error = await createMacSetup(h.deps)
      .installer.ensureInstalled()
      .then(
        () => null,
        (cause: unknown) => cause as Error
      )
    expect(error?.message).toContain(VIRTUAL_DISPLAY_FAILED_MESSAGE)
    expect(error?.message).toContain('o macOS recusou criar o monitor virtual')
    expect(h.download).not.toHaveBeenCalled()
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
