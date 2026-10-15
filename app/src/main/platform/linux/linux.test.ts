import { describe, expect, it, vi } from 'vitest'
import {
  createLinuxSetup,
  MIRROR_NOTE,
  PORTAL_VIRTUAL_SCRIPT,
  shQuote,
  SUNSHINE_UNIT,
  VIRTUAL_MONITOR_SCRIPT,
  type LinuxSetupDeps
} from './setup'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import { sessionKind } from './session'
import { sunshinePackageFor } from './versions'

const UBUNTU_2404 = 'NAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n'
const DEBIAN_13 = 'ID=debian\nVERSION_ID="13"\n'

describe('sunshinePackageFor', () => {
  it('escolhe o pacote do Ubuntu da pessoa, com hash fixo', () => {
    const pkg = sunshinePackageFor(UBUNTU_2404, 'x64')
    expect(pkg.kind).toBe('deb')
    expect(pkg.fileName).toBe('sunshine-horizonte-ubuntu24.04-amd64.deb')
    expect(pkg.horizonte).toBe(true)
    expect(pkg.url).toBe(
      'https://github.com/mapompeo/horizonte/releases/download/motores-hz1/sunshine-horizonte-ubuntu24.04-amd64.deb'
    )
    expect(pkg.sha256).toMatch(/^[0-9a-f]{64}$/)
    // O 26.10 ainda usa o Sunshine oficial (sem patch): o "+" do nome vai codificado na URL.
    const official = sunshinePackageFor('ID=ubuntu\nVERSION_ID="26.10"\n', 'x64')
    expect(official.horizonte).toBeUndefined()
    expect(official.url).toContain('%2B')
  })

  const pick = (text: string): string => sunshinePackageFor(text, 'x64').fileName

  it('cobre Debian, Fedora, openSUSE e Arch', () => {
    expect(pick('ID=debian\nVERSION_ID="13"\n')).toBe(
      'sunshine_2026.914.233613-1+debiantrixie_amd64.deb'
    )
    expect(pick('ID=fedora\nVERSION_ID=44\n')).toBe('Sunshine-2026.914.233613-1.fc44.x86_64.rpm')
    expect(pick('ID=opensuse-tumbleweed\nVERSION_ID="20261010"\n')).toContain('suse.tw')
    expect(pick('ID="opensuse-leap"\nVERSION_ID="16.0"\n')).toContain('suse.lp160')
    expect(pick('ID=arch\n')).toBe('sunshine-2026.914.233613-1-x86_64.pkg.tar.zst')
  })

  it('usa o gerenciador certo de cada família', () => {
    const kind = (text: string): string => sunshinePackageFor(text, 'x64').kind
    expect(kind('ID=fedora\nVERSION_ID=44\n')).toBe('rpm-dnf')
    expect(kind('ID=opensuse-tumbleweed\n')).toBe('rpm-zypper')
    expect(kind('ID=arch\n')).toBe('pacman')
  })

  it('derivados caem na família certa', () => {
    // Linux Mint 22: ID próprio, VERSION_ID próprio, base Ubuntu 24.04 (noble).
    expect(
      pick('ID=linuxmint\nID_LIKE="ubuntu debian"\nVERSION_ID="22"\nUBUNTU_CODENAME=noble\n')
    ).toContain('ubuntu24.04')
    expect(pick('ID=manjaro\nID_LIKE=arch\n')).toContain('pkg.tar.zst')
    expect(pick('ID=nobara\nID_LIKE="rhel centos fedora"\nVERSION_ID=43\n')).toContain('fc43')
  })

  it('recusa com uma frase clara o que não tem pacote', () => {
    expect(() => sunshinePackageFor('ID=gentoo\n', 'x64')).toThrow(/Ubuntu, Debian 13, Fedora/)
    expect(() => sunshinePackageFor('ID=ubuntu\nVERSION_ID="18.04"\n', 'x64')).toThrow(/18\.04/)
    expect(() => sunshinePackageFor('ID=debian\nVERSION_ID="12"\n', 'x64')).toThrow(/Debian 12/)
    expect(() => sunshinePackageFor(UBUNTU_2404, 'arm64')).toThrow(/x64/)
  })
})

describe('sessionKind', () => {
  it('reconhece Xorg, Wayland e o que não dá para saber', () => {
    expect(sessionKind({ XDG_SESSION_TYPE: 'x11' })).toBe('x11')
    expect(sessionKind({ XDG_SESSION_TYPE: 'wayland' })).toBe('wayland')
    expect(sessionKind({ WAYLAND_DISPLAY: 'wayland-0' })).toBe('wayland')
    expect(sessionKind({ DISPLAY: ':0' })).toBe('x11')
    expect(sessionKind({})).toBe('unknown')
  })
})

describe('shQuote', () => {
  it('não deixa o shell interpretar nada', () => {
    expect(shQuote("a'b")).toBe(`'a'\\''b'`)
    expect(shQuote('$(rm -rf ~)')).toBe("'$(rm -rf ~)'")
  })
})

interface Harness {
  deps: LinuxSetupDeps
  privileged: string[]
  user: string[]
  download: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

function harness(
  options: {
    installed?: boolean
    active?: boolean
    responding?: boolean
    monitor?: boolean
    firewall?: boolean
    portal?: boolean
    virtual?: boolean
    stored?: boolean
    env?: Record<string, string>
  } = {}
): Harness {
  const privileged: string[] = []
  const user: string[] = []
  const download = vi.fn(async () => undefined)
  const save = vi.fn(async () => undefined)
  const deps: LinuxSetupDeps = {
    probe: {
      sunshineInstalled: async () => options.installed ?? false,
      serviceActive: async () => options.active ?? false,
      sunshineResponding: async () => options.responding ?? false,
      monitorPresent: async () => options.monitor ?? false,
      firewallReady: async () => options.firewall ?? true,
      sunshinePatched: async () => options.portal ?? false,
      portalVirtualSupported: async () => options.virtual ?? true
    },
    vault: {
      load: async () =>
        options.stored ? { username: 'horizonte', password: 'velha', port: 47989 } : null,
      save
    },
    download,
    runPrivileged: async (script) => void privileged.push(script),
    runUser: async (script) => void user.push(script),
    // Debian 13 usa o Sunshine oficial: os testes de "já instalado" não disparam a troca pelo do Horizonte.
    packageForThisSystem: () => sunshinePackageFor(DEBIAN_13, 'x64'),
    env: options.env ?? { XDG_SESSION_TYPE: 'x11' },
    waitForApi: async () => undefined,
    generatePassword: () => 'senha-nova',
    workDir: '/tmp',
    port: 47989
  }
  return { deps, privileged, user, download, save }
}

const fakeDisplay = (friendlyName: string): SunshineDisplay => ({
  deviceId: friendlyName,
  displayName: friendlyName,
  friendlyName,
  width: 1920,
  height: 1080,
  primary: false,
  originX: 0
})

describe('createLinuxSetup', () => {
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
      createLinuxSetup(h.deps).display.ensureVirtualDisplay(controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(probes).toBe(0)
  })

  it('cancelar durante gravação impede restart', async () => {
    const h = harness({ installed: true })
    const controller = new AbortController()
    h.deps.vault.save = async () => {
      controller.abort()
    }
    await expect(
      createLinuxSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.user).toHaveLength(1)
    expect(h.user[0]).toContain('--creds')
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
    const pending = createLinuxSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    await failure
    expect(h.privileged).toEqual([])
    expect(h.user).toEqual([])
    expect(h.save).not.toHaveBeenCalled()
  })

  it('cancelar após instalação impede credenciais e restart', async () => {
    const h = harness()
    const controller = new AbortController()
    h.deps.runPrivileged = async () => {
      controller.abort()
    }
    await expect(
      createLinuxSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.user).toEqual([])
    expect(h.save).not.toHaveBeenCalled()
  })

  it('cancelar no progresso impede chamada privilegiada', async () => {
    const h = harness()
    const controller = new AbortController()
    await expect(
      createLinuxSetup(h.deps).installer.ensureInstalled((p) => {
        if (p.permission) controller.abort()
      }, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.privileged).toEqual([])
  })

  it('cancelar após comando de credenciais impede gravação e restart', async () => {
    const h = harness({ installed: true })
    const controller = new AbortController()
    h.deps.runUser = async (script) => {
      h.user.push(script)
      controller.abort()
    }
    await expect(
      createLinuxSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.user).toHaveLength(1)
    expect(h.user[0]).toContain('--creds')
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
    const setup = createLinuxSetup(h.deps)
    const first = setup.installer.ensureInstalled(undefined, controller.signal)
    const failure = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await downloading
    controller.abort()
    const second = setup.display.ensureVirtualDisplay()
    finish()
    await failure
    await second
    expect(downloads).toBe(2)
    expect(h.privileged).toHaveLength(1)
  })

  it('computador limpo: baixa, instala com UM aviso, guarda a senha e cria o monitor', async () => {
    const h = harness()
    await createLinuxSetup(h.deps).installer.ensureInstalled()

    expect(h.download).toHaveBeenCalledOnce()
    expect(h.privileged).toHaveLength(1)
    expect(h.privileged[0]).toContain('sha256sum -c')
    expect(h.privileged[0]).toContain('apt-get install')
    expect(h.save).toHaveBeenCalledWith({
      username: 'horizonte',
      password: 'senha-nova',
      port: 47989
    })
    expect(h.user.join('\n')).toContain("sunshine --creds 'horizonte' 'senha-nova'")
    expect(h.user.join('\n')).toContain('systemctl --user')
    expect(h.user).toContain(VIRTUAL_MONITOR_SCRIPT)
  })

  it('liga o serviço pelo nome de verdade da unidade, e não por "sunshine" (visto num Ubuntu real, na CI)', async () => {
    const h = harness()
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    const all = h.user.join('\n')
    // O alias sunshine.service só passa a existir depois de habilitar a unidade real: antes disso o enable falha.
    expect(all).toContain(
      `systemctl --user enable ${SUNSHINE_UNIT} && systemctl --user restart ${SUNSHINE_UNIT}`
    )
    expect(all).not.toMatch(/systemctl --user (enable|restart|enable --now) sunshine\b/)
    expect(SUNSHINE_UNIT).toBe('app-dev.lizardbyte.app.Sunshine.service')
  })

  it('tudo pronto: não baixa, não pede administrador e não mexe em nada', async () => {
    const h = harness({
      installed: true,
      active: true,
      responding: true,
      stored: true,
      monitor: true
    })
    await createLinuxSetup(h.deps).installer.ensureInstalled()

    expect(h.download).not.toHaveBeenCalled()
    expect(h.privileged).toEqual([])
    expect(h.user).toEqual([])
  })

  it('só o monitor virtual sumiu (nova sessão): recria sem reinstalar', async () => {
    const h = harness({ installed: true, active: true, responding: true, stored: true })
    await createLinuxSetup(h.deps).installer.ensureInstalled()

    expect(h.user).toEqual([VIRTUAL_MONITOR_SCRIPT])
    expect(h.privileged).toEqual([])
  })

  it('serviço parado: só liga o serviço, sem trocar a senha', async () => {
    const h = harness({ installed: true, stored: true, monitor: true })
    await createLinuxSetup(h.deps).installer.ensureInstalled()

    expect(h.user).toEqual([`systemctl --user enable --now ${SUNSHINE_UNIT}`])
    expect(h.save).not.toHaveBeenCalled()
  })

  it('serviço ativo sem responder é reiniciado antes de esperar a API', async () => {
    const h = harness({
      installed: true,
      active: true,
      responding: false,
      stored: true,
      monitor: true
    })
    let restarted = false
    h.deps.runUser = async (script) => {
      restarted = script.includes(`systemctl --user restart ${SUNSHINE_UNIT}`)
    }
    h.deps.waitForApi = async () => {
      if (!restarted) throw new Error('serviço continua preso')
    }
    await expect(createLinuxSetup(h.deps).installer.ensureInstalled()).resolves.toBeUndefined()
    expect(h.download).not.toHaveBeenCalled()
    expect(h.save).not.toHaveBeenCalled()
  })

  it('Wayland: não falha, instala e espelha a tela principal', async () => {
    const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' } })
    const notes: string[] = []
    const setup = createLinuxSetup(h.deps)
    await setup.installer.ensureInstalled((p) => notes.push(p.note))
    expect(h.privileged).toHaveLength(1)
    expect(h.user.some((script) => script.includes('xrandr'))).toBe(false)
    expect(notes).toContain(MIRROR_NOTE)
    const main = { ...fakeDisplay('eDP-1'), primary: true }
    expect(setup.display.isVirtual(main)).toBe(true)
    expect(setup.display.isVirtual({ ...fakeDisplay('HDMI-1'), originX: 1920 })).toBe(false)
  })

  it('Wayland com o Sunshine do Horizonte: liga o monitor virtual do portal em vez de espelhar', async () => {
    const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: true })
    const notes: string[] = []
    const setup = createLinuxSetup(h.deps)
    await setup.installer.ensureInstalled((p) => notes.push(p.note))
    expect(h.user).toContain(PORTAL_VIRTUAL_SCRIPT)
    expect(notes).not.toContain(MIRROR_NOTE)
    expect(setup.display.config?.()).toEqual({ capture: 'portal' })
    expect(setup.display.outputName?.()).toBe('0')
  })

  it('Wayland sem monitor virtual no portal (ex.: alguns ambientes): espelha, mesmo com o Sunshine do Horizonte', async () => {
    const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: true, virtual: false })
    const notes: string[] = []
    const setup = createLinuxSetup(h.deps)
    await setup.installer.ensureInstalled((p) => notes.push(p.note))
    expect(notes).toContain(MIRROR_NOTE)
    expect(h.user).not.toContain(PORTAL_VIRTUAL_SCRIPT)
    expect(setup.display.config?.()).toEqual({})
  })

  it('o ajuste do portal só reinicia o serviço quando é novo', () => {
    expect(PORTAL_VIRTUAL_SCRIPT).toContain('if ! grep -qx "$line" "$file"')
    expect(PORTAL_VIRTUAL_SCRIPT).toContain('Environment=SUNSHINE_PORTAL_VIRTUAL=1')
    // O shell recebe "\n" escrito, e o printf transforma em quebra de linha.
    expect(PORTAL_VIRTUAL_SCRIPT).toContain("printf '[Service]\\n%s\\n'")
  })

  it('Xorg não usa o portal: sem captura extra nem saída fixa', async () => {
    const h = harness({ portal: true })
    const setup = createLinuxSetup(h.deps)
    await setup.installer.ensureInstalled()
    expect(setup.display.config?.()).toEqual({})
    expect(setup.display.outputName?.()).toBeNull()
  })

  it('Xorg que recusa o monitor virtual também cai no espelho, sem erro', async () => {
    const h = harness({ installed: true, active: true, responding: true, stored: true })
    h.deps.runUser = async (script) => {
      if (script.includes('xrandr')) throw new Error('xrandr: não suportado')
    }
    const notes: string[] = []
    const setup = createLinuxSetup(h.deps)
    await expect(
      setup.installer.ensureInstalled((p) => notes.push(p.note))
    ).resolves.toBeUndefined()
    expect(notes).toContain(MIRROR_NOTE)
  })

  it('cancelar durante o monitor virtual continua sendo cancelamento, não espelho', async () => {
    const h = harness({ installed: true, active: true, responding: true, stored: true })
    const controller = new AbortController()
    h.deps.runUser = async () => {
      controller.abort()
      throw new Error('interrompido')
    }
    await expect(
      createLinuxSetup(h.deps).installer.ensureInstalled(undefined, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('comando de instalação acompanha o gerenciador do pacote', async () => {
    const run = async (osRelease: string): Promise<string> => {
      const h = harness()
      h.deps.packageForThisSystem = () => sunshinePackageFor(osRelease, 'x64')
      await createLinuxSetup(h.deps).installer.ensureInstalled()
      return h.privileged[0] ?? ''
    }
    expect(await run(UBUNTU_2404)).toContain('apt-get install')
    expect(await run('ID=fedora\nVERSION_ID=44\n')).toContain('dnf install')
    expect(await run('ID=opensuse-tumbleweed\n')).toContain('zypper')
    expect(await run('ID=arch\n')).toContain('pacman -U')
    expect(await run('ID=arch\n')).toContain('sha256sum -c')
  })

  it('firewall ativo: libera as portas junto da instalação, num só aviso de administrador', async () => {
    const h = harness({ firewall: false })
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    expect(h.privileged).toHaveLength(1)
    expect(h.privileged[0]).toContain(
      'ufw allow from "$net" to any port 24800,47900,47901,47984,47989,48010 proto tcp'
    )
    expect(h.user.some((script) => script.includes('firewall-ok-v2'))).toBe(true)
  })

  it('motor já instalado e firewall pendente: só um aviso para liberar as portas', async () => {
    const h = harness({
      installed: true,
      active: true,
      responding: true,
      stored: true,
      firewall: false
    })
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    expect(h.privileged).toHaveLength(1)
    expect(h.privileged[0]).not.toContain('apt-get')
    expect(h.privileged[0]).toContain('47998,47999,48000,48002,48010')
  })

  it('firewall já tratado: nenhum aviso extra', async () => {
    const h = harness({ installed: true, active: true, responding: true, stored: true })
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    expect(h.privileged).toEqual([])
  })

  it('Sunshine oficial no Ubuntu: troca pelo do Horizonte, num só aviso de administrador', async () => {
    const h = harness({ installed: true, active: true, responding: true, stored: true })
    h.deps.packageForThisSystem = () => sunshinePackageFor(UBUNTU_2404, 'x64')
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    expect(h.download).toHaveBeenCalledOnce()
    expect(h.privileged).toHaveLength(1)
    expect(h.privileged[0]).toContain('sunshine-horizonte-ubuntu24.04-amd64.deb')
  })

  it('Sunshine do Horizonte já instalado: não troca nada', async () => {
    const h = harness({
      installed: true,
      active: true,
      responding: true,
      stored: true,
      portal: true
    })
    h.deps.packageForThisSystem = () => sunshinePackageFor(UBUNTU_2404, 'x64')
    await createLinuxSetup(h.deps).installer.ensureInstalled()
    expect(h.download).not.toHaveBeenCalled()
    expect(h.privileged).toEqual([])
  })

  it('duas chamadas ao mesmo tempo compartilham uma só preparação', async () => {
    const h = harness()
    const setup = createLinuxSetup(h.deps)
    await Promise.all([setup.installer.ensureInstalled(), setup.display.ensureVirtualDisplay()])
    expect(h.privileged).toHaveLength(1)
  })

  it('reconhece o monitor virtual pelo nome', () => {
    const { display } = createLinuxSetup(harness().deps)
    expect(display.isVirtual(fakeDisplay('HorizonteVirtual'))).toBe(true)
    expect(display.isVirtual(fakeDisplay('eDP-1'))).toBe(false)
  })
})
