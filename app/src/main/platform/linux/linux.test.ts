import { describe, expect, it, vi } from 'vitest'
import { createLinuxSetup, shQuote, VIRTUAL_MONITOR_SCRIPT, type LinuxSetupDeps } from './setup'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import { sessionKind, WAYLAND_MESSAGE } from './session'
import { sunshineDebFor } from './versions'

const UBUNTU_2404 = 'NAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n'

describe('sunshineDebFor', () => {
  it('escolhe o pacote do Ubuntu da pessoa, com hash fixo', () => {
    const deb = sunshineDebFor(UBUNTU_2404, 'x64')
    expect(deb.fileName).toBe('sunshine_2026.914.233613-1+ubuntu24.04_amd64.deb')
    expect(deb.url).toContain('%2B') // o "+" do nome vai codificado na URL
    expect(deb.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('outras distribuições, versões e processadores são recusados com uma frase clara', () => {
    expect(() => sunshineDebFor('ID=fedora\nVERSION_ID=40\n', 'x64')).toThrow(/Ubuntu/)
    expect(() => sunshineDebFor('ID=ubuntu\nVERSION_ID="18.04"\n', 'x64')).toThrow(/18\.04/)
    expect(() => sunshineDebFor(UBUNTU_2404, 'arm64')).toThrow(/x64/)
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
      monitorPresent: async () => options.monitor ?? false
    },
    vault: {
      load: async () =>
        options.stored ? { username: 'horizonte', password: 'velha', port: 47989 } : null,
      save
    },
    download,
    runPrivileged: async (script) => void privileged.push(script),
    runUser: async (script) => void user.push(script),
    debForThisSystem: () => sunshineDebFor(UBUNTU_2404, 'x64'),
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

    expect(h.user).toEqual(['systemctl --user enable --now sunshine'])
    expect(h.save).not.toHaveBeenCalled()
  })

  it('Wayland: explica como trocar para Xorg e não instala nada', async () => {
    const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' } })
    await expect(createLinuxSetup(h.deps).installer.ensureInstalled()).rejects.toThrow(
      WAYLAND_MESSAGE
    )
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
