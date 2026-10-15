import { describe, expect, it } from 'vitest'
import { DESKFLOW_WINDOWS, deskflowLinuxFor } from './versions'

describe('versões do Deskflow', () => {
  it('Windows usa o zip portátil, com hash fixo', () => {
    expect(DESKFLOW_WINDOWS.fileName).toBe('deskflow-1.27.0-win-x64-portable.zip')
    expect(DESKFLOW_WINDOWS.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('distribuições com pacote próprio usam o nativo', () => {
    expect(deskflowLinuxFor('ID=ubuntu\nVERSION_ID="26.04"\n', 'x64').kind).toBe('deb')
    expect(deskflowLinuxFor('ID=fedora\nVERSION_ID=46\n', 'x64').kind).toBe('rpm-dnf')
    expect(deskflowLinuxFor('ID=arch\n', 'x64').kind).toBe('pacman')
  })

  it('Ubuntu 24.04 (sem pacote nesta versão) e o resto caem no Flatpak', () => {
    expect(deskflowLinuxFor('ID=ubuntu\nVERSION_ID="24.04"\n', 'x64').kind).toBe('flatpak')
    expect(deskflowLinuxFor('ID=gentoo\n', 'x64').kind).toBe('flatpak')
  })

  it('processador que não é x64 é recusado com uma frase clara', () => {
    expect(() => deskflowLinuxFor('ID=ubuntu\nVERSION_ID="26.04"\n', 'arm64')).toThrow(/x64/)
  })
})
