import { describe, expect, it, vi } from 'vitest'
import { ensureDeskflowLinux, INSTALL_FLATPAK, type LinuxDeskflowDeps } from './linux-install'
import { deskflowLinuxFor } from './versions'

const UBUNTU_2604 = 'ID=ubuntu\nVERSION_ID="26.04"\n'
const UBUNTU_2404 = 'ID=ubuntu\nVERSION_ID="24.04"\n'

function harness(options: {
  has?: string[]
  flatpakApp?: boolean
  os?: string
}): LinuxDeskflowDeps & { privileged: string[]; user: string[]; downloads: string[] } {
  const privileged: string[] = []
  const user: string[] = []
  const downloads: string[] = []
  return {
    privileged,
    user,
    downloads,
    has: async (command) => (options.has ?? []).includes(command),
    flatpakHasApp: async () => options.flatpakApp ?? false,
    pkg: () => deskflowLinuxFor(options.os ?? UBUNTU_2604, 'x64'),
    download: vi.fn(async (_pkg, dest: string) => void downloads.push(dest)),
    runPrivileged: async (script) => void privileged.push(script),
    runUser: async (script) => void user.push(script),
    workDir: '/tmp'
  }
}

describe('ensureDeskflowLinux', () => {
  it('Deskflow já instalado: não baixa nem pede senha', async () => {
    const h = harness({ has: ['deskflow-core'] })
    expect(await ensureDeskflowLinux(h)).toEqual({ command: 'deskflow-core', prefix: [] })
    expect(h.downloads).toEqual([])
    expect(h.privileged).toEqual([])
  })

  it('Flatpak do Deskflow já instalado: usa ele', async () => {
    const h = harness({ has: ['flatpak'], flatpakApp: true })
    const command = await ensureDeskflowLinux(h)
    expect(command.command).toBe('flatpak')
    expect(command.prefix).toContain('--command=deskflow-core')
  })

  it('distribuição com pacote nativo: baixa, confere o hash de novo e instala num só aviso', async () => {
    const h = harness({ os: UBUNTU_2604 })
    expect(await ensureDeskflowLinux(h)).toEqual({ command: 'deskflow-core', prefix: [] })
    expect(h.privileged).toHaveLength(1)
    expect(h.privileged[0]).toContain('sha256sum -c')
    expect(h.privileged[0]).toContain('apt-get install')
    expect(h.user).toEqual([])
  })

  it('Ubuntu 24.04 sem Flatpak: instala o Flatpak (um aviso) e o Deskflow na conta da pessoa', async () => {
    const h = harness({ os: UBUNTU_2404 })
    const command = await ensureDeskflowLinux(h)
    expect(command.command).toBe('flatpak')
    expect(h.privileged).toEqual([INSTALL_FLATPAK])
    expect(h.user[0]).toContain('flatpak install --user -y --noninteractive')
    expect(h.user[0]).toContain('deskflow-1.27.0-linux-x86_64.flatpak')
  })

  it('Ubuntu 24.04 já com Flatpak: nenhum aviso de senha', async () => {
    const h = harness({ os: UBUNTU_2404, has: ['flatpak'] })
    await ensureDeskflowLinux(h)
    expect(h.privileged).toEqual([])
    expect(h.user).toHaveLength(1)
  })
})
