import type { PinnedArtifact } from '../windows/versions'

export type PackageKind = 'deb' | 'rpm-dnf' | 'rpm-zypper' | 'pacman'

/** Pacote do motor de transmissão, com o gerenciador que sabe instalá-lo. */
/** `horizonte`: o Sunshine do Horizonte (engines/sunshine), que estende a tela no Wayland. */
export type LinuxPackage = PinnedArtifact & { kind: PackageKind; horizonte?: true }

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

/**
 * Sunshine do Horizonte (2026.914.233613 + patches de engines/sunshine), compilado pelo CI do projeto e publicado
 * na release motores-hz1. Hash publicado pela API do GitHub.
 */
const horizonteDeb = (ubuntu: string, sha256: string): LinuxPackage => {
  const fileName = `sunshine-horizonte-ubuntu${ubuntu}-amd64.deb`
  return {
    kind: 'deb',
    horizonte: true,
    version: '2026.914.2336131',
    fileName,
    url: `https://github.com/mapompeo/horizonte/releases/download/motores-hz1/${fileName}`,
    sha256
  }
}

const UBUNTU: Record<string, LinuxPackage> = {
  '22.04': horizonteDeb(
    '22.04',
    '94894e6e31b0e2aaacbb67ee99bdf62cdd7cdf82f952396478fcfefbd94e5d23'
  ),
  '24.04': horizonteDeb(
    '24.04',
    '9bcd26121324f0683deb3d5e20ecbf1e90bfc76dae93a063f58736615414b248'
  ),
  '26.04': horizonteDeb(
    '26.04',
    '3aafe5ae4a481fc443928cf9948d7dad8bf4906f62fb781ed1c1a7e63794add2'
  ),
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
 * Moonlight 6.1.0 do Horizonte (AppImage, engines/moonlight) para receber a tela. Compilado pelo CI do projeto
 * e publicado na release motores-hz1; hash publicado pela API do GitHub.
 */
export const MOONLIGHT_LINUX_APPIMAGE: PinnedArtifact = {
  version: '6.1.0-hz1',
  fileName: 'Moonlight-horizonte-x86_64.AppImage',
  url: 'https://github.com/mapompeo/horizonte/releases/download/motores-hz1/Moonlight-horizonte-x86_64.AppImage',
  sha256: '1e6e0fdd004a60953710f531ad4d5c403614ded7814eccea56c9d825bbf07b4f'
}
