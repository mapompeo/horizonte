import type { PinnedArtifact } from '../windows/versions'

export type PackageKind = 'deb' | 'rpm-dnf' | 'rpm-zypper' | 'pacman'

/** Pacote do motor de transmissão, com o gerenciador que sabe instalá-lo. */
export type LinuxPackage = PinnedArtifact & { kind: PackageKind }

/**
 * Sunshine 2026.914.233613 (x64) para as famílias Debian, Fedora, openSUSE e Arch. O hash é o `digest` que a
 * API do GitHub publica para cada pacote, conferido em 13/10/2026 (e recalculado baixando o rpm do Fedora 44 e
 * o pacote do Arch).
 */
const VERSION = '2026.914.233613'
const base = `https://github.com/LizardByte/Sunshine/releases/download/v${VERSION}`
const pin = (kind: PackageKind, fileName: string, sha256: string): LinuxPackage => ({
  kind,
  version: VERSION,
  fileName,
  url: `${base}/${encodeURIComponent(fileName)}`,
  sha256
})
const deb = (suffix: string, sha256: string): LinuxPackage =>
  pin('deb', `sunshine_${VERSION}-1+${suffix}_amd64.deb`, sha256)
const fedora = (release: string, sha256: string): LinuxPackage =>
  pin('rpm-dnf', `Sunshine-${VERSION}-1.fc${release}.x86_64.rpm`, sha256)
const suse = (flavor: string, sha256: string): LinuxPackage =>
  pin('rpm-zypper', `Sunshine-${VERSION}-1.suse.${flavor}.x86_64.rpm`, sha256)

const UBUNTU: Record<string, LinuxPackage> = {
  '22.04': deb('ubuntu22.04', 'c7645396027b0601a09d49de89674b80b3c9ac7a3dffe0d52703738dab072f1c'),
  '24.04': deb('ubuntu24.04', 'c38e9c705f650f8705f61702717e99bec34044c5028fcb8f23a08fe041292c21'),
  '26.04': deb('ubuntu26.04', 'b8a8ceeeb2b3f30a18a994ad268c94e0c91170f33a864c7aad31eed927ad7d47'),
  '26.10': deb('ubuntu26.10', '1cedccbf3ce7836f1e83a74c23dd8dd7b49e2a0d341198f5b3ca47145244aedd')
}
/** Derivados do Ubuntu (Mint, Pop!_OS, Zorin...) trazem o VERSION_ID próprio; o codinome do Ubuntu base é o que vale. */
const UBUNTU_BY_CODENAME: Record<string, string> = {
  jammy: '22.04',
  noble: '24.04',
  resolute: '26.04'
}
const DEBIAN: Record<string, LinuxPackage> = {
  '13': deb('debiantrixie', 'a86f858cbae57f60ecebd445402ee0295c1c057b857bd45d44c2ea2d255cbbfb')
}
const FEDORA: Record<string, LinuxPackage> = {
  '43': fedora('43', 'e44612e6e85458a183dc47a535c93c367ecf7f260b05daeac54bf0f4f5637080'),
  '44': fedora('44', '2abb16033ecde677f5c45322b39b6d6ae4cf297ac3e36707aa90bd3911d0e00f'),
  '45': fedora('45', 'a46b83e8c8e6c8fc2e0601464b43e9c3fd2f67907a23b537ea64ff58ba4fadf3'),
  '46': fedora('46', '451c6c1ccee6edaa8734f12cd3fb9b0ffe2ce3d21cfe2681c9e9fd8c17c859c1')
}
const SUSE_LEAP_16 = suse(
  'lp160',
  '092b631afd236098f45641eed1ce67c237e67b7ff52d9d391ba83eafac9101eb'
)
const SUSE_TUMBLEWEED = suse(
  'tw',
  '33418d232f959ac1698c6f11f90e25bb018c33da5cbf616c3a18b412de67d7e4'
)
const ARCH = pin(
  'pacman',
  `sunshine-${VERSION}-1-x86_64.pkg.tar.zst`,
  '17eb8c4d823a2693038f40aeeab56943ef0d5d6ace8ac90b3693905b0acbba87'
)

/** Lê `/etc/os-release` e devolve o pacote certo, ou explica por que não há. */
export function sunshinePackageFor(osRelease: string, arch: string): LinuxPackage {
  const field = (name: string): string =>
    new RegExp(`^${name}="?([^"\n]*)"?$`, 'm').exec(osRelease)?.[1] ?? ''
  if (arch !== 'x64') {
    throw new Error('Por enquanto o Horizonte no Linux só instala em processador x64.')
  }
  const id = field('ID')
  const family = new Set([id, ...field('ID_LIKE').split(/\s+/)])
  const version = field('VERSION_ID')
  const unsupported = (name: string): Error =>
    new Error(`${name} ${version} ainda não tem pacote do motor de transmissão no Horizonte.`)

  if (id === 'ubuntu' || family.has('ubuntu')) {
    const release =
      id === 'ubuntu' ? version : (UBUNTU_BY_CODENAME[field('UBUNTU_CODENAME')] ?? version)
    const found = UBUNTU[release]
    if (!found) throw unsupported('O Ubuntu')
    return found
  }
  if (id === 'debian' || family.has('debian')) {
    const found = DEBIAN[version.split('.')[0] ?? '']
    if (!found) throw unsupported('O Debian')
    return found
  }
  if (id === 'fedora' || family.has('fedora')) {
    const found = FEDORA[version]
    if (!found) throw unsupported('O Fedora')
    return found
  }
  if (id === 'opensuse-tumbleweed') return SUSE_TUMBLEWEED
  if (id === 'opensuse-leap' || id === 'sles' || family.has('suse')) {
    if (version.startsWith('16')) return SUSE_LEAP_16
    throw unsupported('O openSUSE')
  }
  if (id === 'arch' || family.has('arch')) return ARCH
  throw new Error(
    'Esta distribuição ainda não tem pacote do motor de transmissão no Horizonte. Funciona no Ubuntu, Debian 13, Fedora, openSUSE e Arch (e derivados).'
  )
}

/**
 * Moonlight 6.1.0 (AppImage) para receber a tela. A API do GitHub não publica o hash deste arquivo: o SHA-256
 * foi calculado baixando o arquivo em 07/10/2026 e fica fixo aqui; qualquer outro conteúdo é recusado.
 */
export const MOONLIGHT_LINUX_APPIMAGE: PinnedArtifact = {
  version: '6.1.0',
  fileName: 'Moonlight-6.1.0-x86_64.AppImage',
  url: 'https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.1.0/Moonlight-6.1.0-x86_64.AppImage',
  sha256: '0e855ffd22d407e18ab5fdb575fed5f01ca119a3f91993c5f0213f15ac80b400'
}
