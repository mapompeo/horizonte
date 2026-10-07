import { describe, expect, it } from 'vitest'
import type { ElevatedStep, Elevation } from './elevation'
import { ElevationError } from './elevation'
import { createWindowsSetup, type SetupDeps } from './setup'
import type { SunshineCredentials } from '../types'

interface Harness {
  deps: SetupDeps
  downloads: string[]
  elevated: ElevatedStep[][]
  saved: SunshineCredentials[]
  waited: number
}

function harness(
  options: {
    sunshineRunning?: boolean
    driverPresent?: boolean
    stored?: SunshineCredentials | null
    elevation?: Elevation
    download?: SetupDeps['download']
    saveFails?: boolean
    consent?: boolean
    responding?: boolean
    controllable?: boolean
    portOpen?: boolean
    outdated?: boolean
  } = {}
): Harness {
  const h: Harness = { deps: undefined as never, downloads: [], elevated: [], saved: [], waited: 0 }
  h.deps = {
    probe: {
      sunshineRunning: async () => options.sunshineRunning ?? false,
      serviceControllable: async () => options.controllable ?? true,
      sunshineResponding: async () => options.responding ?? options.sunshineRunning ?? false,
      driverPresent: async () => options.driverPresent ?? false,
      pairingPortOpen: async () => options.portOpen ?? true,
      sunshineOutdated: async () => options.outdated ?? false
    },
    vault: {
      load: async () => options.stored ?? null,
      save: async (c) => {
        if (options.saveFails) throw new Error('cofre')
        h.saved.push(c)
      }
    },
    download:
      options.download ??
      (async (artifact, dest) => {
        h.downloads.push(artifact.fileName ?? dest)
      }),
    elevation: options.elevation ?? {
      runElevated: async (steps) => {
        h.elevated.push(steps)
      }
    },
    confirmDriverTrust: async () => options.consent ?? true,
    waitForApi: async () => {
      h.waited += 1
    },
    generatePassword: () => 'senha-gerada',
    workDir: 'C:\\tmp\\work',
    sunshineDir: 'C:\\Program Files\\Sunshine',
    port: 47989
  }
  return h
}

const stored = { username: 'horizonte', password: 'guardada', port: 47989 }
const all = (h: Harness): string =>
  h.elevated
    .flat()
    .map((s) => s.script)
    .join('\n')

describe('createWindowsSetup', () => {
  it('cancelar durante consentimento impede download e elevação', async () => {
    const h = harness()
    const controller = new AbortController()
    h.deps.confirmDriverTrust = async () => {
      controller.abort()
      return true
    }
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.downloads).toEqual([])
    expect(h.elevated).toEqual([])
  })

  it('cancelar durante gravação impede espera da API', async () => {
    const h = harness({ driverPresent: true })
    const controller = new AbortController()
    h.deps.vault.save = async () => {
      controller.abort()
    }
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.elevated).toHaveLength(1)
    expect(h.waited).toBe(0)
  })

  it('progresso atrasado após cancelamento é ignorado sem lançar no callback do stream', async () => {
    const h = harness({ driverPresent: true })
    const controller = new AbortController()
    let reports = 0
    h.deps.download = async (_artifact, _dest, onProgress) => {
      controller.abort()
      expect(() => onProgress?.(0.5)).not.toThrow()
    }
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled(() => {
        reports++
      }, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(reports).toBe(0)
    expect(h.elevated).toEqual([])
  })

  it('sinal já cancelado não inicia sondagens nem instalação', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()
    let probes = 0
    h.deps.probe.sunshineRunning = async () => {
      probes++
      return false
    }
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(probes).toBe(0)
    expect(h.elevated).toEqual([])
  })

  it('cancelar interrompe download pendente pelo quarto argumento', async () => {
    const h = harness({ driverPresent: true })
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
    const pending = createWindowsSetup(h.deps).installer.ensureInstalled(
      undefined,
      controller.signal
    )
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    await failure
    expect(h.elevated).toEqual([])
    expect(h.saved).toEqual([])
  })

  it('cancelar no progresso impede elevação e criação de credenciais', async () => {
    const h = harness({ driverPresent: true })
    const controller = new AbortController()
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled((p) => {
        if (p.permission) controller.abort()
      }, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.elevated).toEqual([])
    expect(h.saved).toEqual([])
  })

  it('cancelar durante elevação impede gravação e espera posteriores', async () => {
    const controller = new AbortController()
    const h = harness({
      driverPresent: true,
      elevation: {
        runElevated: async () => {
          controller.abort()
        }
      }
    })
    await expect(
      createWindowsSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.saved).toEqual([])
    expect(h.waited).toBe(0)
  })

  it('nova tentativa aguarda a cancelada e faz sua própria preparação', async () => {
    const h = harness({ driverPresent: true })
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
    const setup = createWindowsSetup(h.deps)
    const first = setup.installer.ensureInstalled(undefined, controller.signal)
    const failure = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    const second = setup.display.ensureVirtualDisplay(new AbortController().signal)
    expect(downloads).toBe(1)
    finish()
    await failure
    await second
    expect(downloads).toBe(2)
    expect(h.elevated).toHaveLength(1)
  })

  it('tudo já instalado: não baixa nem pede administrador', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored })
    const { installer, display } = createWindowsSetup(h.deps)

    await installer.ensureInstalled()
    await display.ensureVirtualDisplay()

    expect(h.downloads).toEqual([])
    expect(h.elevated).toEqual([])
  })

  it('computador limpo: baixa os dois e pede administrador UMA vez, mesmo com as duas chamadas', async () => {
    const h = harness()
    const { installer, display } = createWindowsSetup(h.deps)

    await Promise.all([installer.ensureInstalled(), display.ensureVirtualDisplay()])

    expect(h.downloads).toHaveLength(2)
    expect(h.elevated).toHaveLength(1)
    expect(h.waited).toBe(1)
    expect(h.saved).toEqual([{ username: 'horizonte', password: 'senha-gerada', port: 47989 }])
  })

  it('só o motor de transmissão falta: não mexe no driver', async () => {
    const h = harness({ driverPresent: true })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toContain('msiexec')
    expect(all(h)).not.toContain('pnputil')
    expect(h.downloads).toHaveLength(1)
  })

  it('os caminhos do Windows chegam inteiros ao roteiro', async () => {
    const h = harness()
    await createWindowsSetup(h.deps).installer.ensureInstalled()
    const script = all(h)
    expect(script).toContain('C:\\Program Files\\Sunshine\\sunshine.exe')
    expect(script).toContain('C:\\Program Files\\Sunshine\\config\\sunshine.conf')
    expect(script).toContain('Horizonte\\stage')
  })

  it('serviço rodando mas sem atender: só reinicia o serviço, sem baixar nada', async () => {
    const h = harness({ sunshineRunning: true, responding: false, driverPresent: true, stored })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toContain('Restart-Service')
    expect(all(h)).not.toContain('msiexec')
    expect(h.downloads).toEqual([])
    expect(h.waited).toBe(1)
  })

  it('tudo pronto menos a regra do firewall: só cria a regra, sem baixar nada', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored, portOpen: false })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toContain('New-NetFirewallRule')
    expect(all(h)).toContain('47900,8080')
    expect(all(h)).toContain('40000-40010')
    expect(all(h)).not.toContain('msiexec')
    expect(h.downloads).toEqual([])
  })

  it('motor mais antigo que a versão fixada: baixa e instala por cima, sem trocar a senha', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored, outdated: true })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toContain('msiexec')
    expect(h.downloads).toHaveLength(1)
    expect(h.saved).toEqual([])
  })

  it('só o driver falta: não reinstala o motor de transmissão nem troca a senha', async () => {
    const h = harness({ sunshineRunning: true, stored })
    await createWindowsSetup(h.deps).display.ensureVirtualDisplay()

    expect(all(h)).toContain('pnputil')
    expect(all(h)).not.toContain('msiexec')
    expect(all(h)).not.toContain('--creds')
    expect(h.saved).toEqual([])
  })

  it('Sunshine rodando mas sem senha guardada: refaz a credencial sem reinstalar', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored: null })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).not.toContain('msiexec')
    expect(all(h)).toContain('--creds')
    expect(h.downloads).toEqual([])
    expect(h.saved).toHaveLength(1)
  })

  it('cada arquivo é conferido de novo pelo hash dentro do processo elevado', async () => {
    const h = harness()
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toMatch(/Get-FileHash/)
    expect(all(h)).toContain('1d7fed8beecd5889dc7ff14cf9f42d6d38f37c3066c13c6c2a5f4e91847e0ccf')
  })

  it('a raiz de confiança do driver só existe durante a instalação e sai mesmo se ela falhar', async () => {
    const h = harness({ sunshineRunning: true, stored })
    await createWindowsSetup(h.deps).display.ensureVirtualDisplay()
    const script = all(h)

    expect(script).toContain('TrustedPublisher')
    expect(script).toMatch(/finally\s*\{[^}]*Remove-Item -Path \$rootPath/)
    expect(script).not.toMatch(/certutil|installCert/i)
  })

  it('sem o consentimento da pessoa o driver não é baixado nem instalado', async () => {
    const h = harness({ sunshineRunning: true, stored, consent: false })
    await expect(createWindowsSetup(h.deps).display.ensureVirtualDisplay()).rejects.toThrow(
      /autoriza/
    )
    expect(h.downloads).toEqual([])
    expect(h.elevated).toEqual([])
  })

  it('o consentimento só é pedido quando o driver realmente falta', async () => {
    let asked = 0
    const h = harness({ sunshineRunning: true, driverPresent: true, stored })
    h.deps.confirmDriverTrust = async () => {
      asked += 1
      return true
    }
    await createWindowsSetup(h.deps).display.ensureVirtualDisplay()
    expect(asked).toBe(0)
  })

  it('cria o dispositivo do monitor, não só o pacote', async () => {
    const h = harness({ sunshineRunning: true, stored })
    await createWindowsSetup(h.deps).display.ensureVirtualDisplay()
    expect(all(h)).toContain('UpdateDriverForPlugAndPlayDevicesW')
  })

  it('a senha vai para o cofre depois da instalação e não aparece no erro', async () => {
    const h = harness({
      elevation: {
        runElevated: async () => {
          throw new ElevationError('failed', 'Não consegui concluir o passo "x": ruim')
        }
      }
    })
    const failure = await createWindowsSetup(h.deps)
      .installer.ensureInstalled()
      .catch((c: unknown) => c)

    expect(failure).toBeInstanceOf(ElevationError)
    expect(h.saved).toEqual([])
    expect(String((failure as Error).message)).not.toContain('senha-gerada')
  })

  it('o UAC recusado propaga o erro e uma nova tentativa pede de novo', async () => {
    let calls = 0
    const h = harness({
      elevation: {
        runElevated: async () => {
          calls += 1
          if (calls === 1) throw new ElevationError('denied', 'recusado')
        }
      }
    })
    const { installer } = createWindowsSetup(h.deps)

    await expect(installer.ensureInstalled()).rejects.toMatchObject({ kind: 'denied' })
    await installer.ensureInstalled()
    expect(calls).toBe(2)
  })

  it('falha no download não pede administrador', async () => {
    const h = harness({
      download: async () => {
        throw new Error('sem rede')
      }
    })
    await expect(createWindowsSetup(h.deps).installer.ensureInstalled()).rejects.toThrow('sem rede')
    expect(h.elevated).toEqual([])
  })

  it('o instalador usa a senha guardada quando refaz a credencial', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored })
    // guardada existe e Sunshine roda: nada a fazer
    await createWindowsSetup(h.deps).installer.ensureInstalled()
    expect(h.elevated).toEqual([])
  })

  it('o progresso diz o que está acontecendo de verdade e só anda para frente', async () => {
    const h = harness({
      download: async (_a, _d, onProgress) => {
        onProgress?.(0.5)
      }
    })
    const seen: { note: string; fraction: number }[] = []
    await createWindowsSetup(h.deps).installer.ensureInstalled((p) => seen.push(p))

    const notes = seen.map((p) => p.note)
    expect(notes.some((n) => /Baixando o motor/.test(n))).toBe(true)
    expect(notes.some((n) => /Baixando o monitor/.test(n))).toBe(true)
    expect(notes.some((n) => /Instalando o motor/.test(n))).toBe(true)
    expect(notes.some((n) => /Esperando o motor ligar/.test(n))).toBe(true)
    expect(seen.every((p) => p.fraction >= 0 && p.fraction <= 1)).toBe(true)
    expect(seen.map((p) => p.fraction)).toEqual(
      [...seen.map((p) => p.fraction)].sort((a, b) => a - b)
    )
    expect(seen.at(-1)?.fraction).toBe(1)
  })

  it('avisa que o Windows vai pedir permissão só durante a instalação', async () => {
    const h = harness()
    const seen: { note: string; fraction: number; permission?: boolean }[] = []
    await createWindowsSetup(h.deps).installer.ensureInstalled((p) => seen.push(p))

    const asking = seen.filter((p) => p.permission)
    expect(asking.length).toBeGreaterThan(0)
    expect(asking.every((p) => /Instalando/.test(p.note))).toBe(true)
    expect(seen.at(-1)?.permission).toBeUndefined()
  })

  it('dá à pessoa comum o direito de reiniciar o serviço, para não pedir administrador nas próximas vezes', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored, controllable: false })
    await createWindowsSetup(h.deps).installer.ensureInstalled()

    expect(all(h)).toContain('sdset SunshineService')
    expect(all(h)).not.toContain('msiexec')
    expect(h.downloads).toEqual([])
  })

  it('com a permissão já dada não mexe no serviço', async () => {
    const h = harness({ sunshineRunning: true, driverPresent: true, stored, controllable: true })
    await createWindowsSetup(h.deps).installer.ensureInstalled()
    expect(h.elevated).toEqual([])
  })
})
