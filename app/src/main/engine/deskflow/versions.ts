import type { PinnedArtifact } from '../../platform/windows/versions'

/**
 * Deskflow 1.27.0 (GPL-2.0), o motor do compartilhamento de mouse e teclado. Hashes publicados pela API do
 * GitHub para cada pacote (conferidos em 14/10/2026; o zip do Windows também baixando o arquivo).
 */
const VERSION = '1.27.0'
const base = `https://github.com/deskflow/deskflow/releases/download/v${VERSION}`
const pin = (fileName: string, sha256: string): PinnedArtifact => ({
  version: VERSION,
  fileName,
  url: `${base}/${fileName}`,
  sha256
})

/** Windows: versão portátil, sem instalador nem administrador. */
export const DESKFLOW_WINDOWS = pin(
  `deskflow-${VERSION}-win-x64-portable.zip`,
  '8d19004cc3625623489d96580c1b58fd13ee78185689907fd4478595f93fab9a'
)

export type DeskflowLinuxKind = 'deb' | 'rpm-dnf' | 'rpm-zypper' | 'pacman' | 'flatpak'
export type DeskflowLinuxPackage = PinnedArtifact & { kind: DeskflowLinuxKind }

const linux = (kind: DeskflowLinuxKind, suffix: string, sha256: string): DeskflowLinuxPackage => ({
  kind,
  ...pin(`deskflow-${VERSION}-${suffix}`, sha256)
})

const PACKAGES = {
  ubuntu2604: linux(
    'deb',
    'ubuntu-resolute-x86_64.deb',
    'b8972871a0a1d9958968696bceafb28571ad50d17b2d35ae8149a95a28fd7fa3'
  ),
  ubuntu2610: linux(
    'deb',
    'ubuntu-stonking-x86_64.deb',
    '9922237b12cbeeafdb81f4a3cef6fb1609cd25ee1791f976e4938715babd67b5'
  ),
  debian13: linux(
    'deb',
    'debian-trixie-x86_64.deb',
    '1f7de2f1fbc68de410339dbdb11ed0e5439bd49bfbfbf66f4467def1c6bb5f96'
  ),
  debian14: linux(
    'deb',
    'debian-forky-x86_64.deb',
    '5d0777b490de392df72aba98cccc9b05b7079d2f05d37753930767b4d26f3485'
  ),
  fedora44: linux(
    'rpm-dnf',
    'fedora-44-x86_64.rpm',
    '71cdeec92e4351fced4cf907db5e936959a0923b2855284ca52d8cf1088205a9'
  ),
  fedora46: linux(
    'rpm-dnf',
    'fedora-46-x86_64.rpm',
    'dd1d4a8f8cc0752649d58d890c2bbe30d76b6c89bbd4ce747417af2aee9e0008'
  ),
  tumbleweed: linux(
    'rpm-zypper',
    'opensuse-tumbleweed-x86_64.rpm',
    '0e0c3996e068603e379586134f894fb3c44ec3b32ed1696a7fb75113ec7ac633'
  ),
  arch: linux(
    'pacman',
    'arch-x86_64.pkg.tar.zst',
    '0e07acfe1b1d2e65338ac6ee4d9c607566c7d71c4f88bce7a91b3e77b1a06252'
  ),
  flatpak: linux(
    'flatpak',
    'linux-x86_64.flatpak',
    '9fd7cac6a036f915c9c4775391c6bee0e04a8de9453bc27091499c2b0a19a5eb'
  )
}

/**
 * Pacote nativo quando a distribuição tem um; senão o Flatpak, que roda em qualquer uma (inclusive Ubuntu 22.04 e
 * 24.04, que não têm pacote próprio nesta versão).
 */
export function deskflowLinuxFor(osRelease: string, arch: string): DeskflowLinuxPackage {
  if (arch !== 'x64')
    throw new Error('Por enquanto o Horizonte no Linux só instala em processador x64.')
  const field = (name: string): string =>
    new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(osRelease)?.[1] ?? ''
  const id = field('ID')
  const version = field('VERSION_ID')
  if (id === 'ubuntu' && version === '26.04') return PACKAGES.ubuntu2604
  if (id === 'ubuntu' && version === '26.10') return PACKAGES.ubuntu2610
  if (id === 'debian' && version.startsWith('13')) return PACKAGES.debian13
  if (id === 'debian' && version.startsWith('14')) return PACKAGES.debian14
  if (id === 'fedora' && version === '44') return PACKAGES.fedora44
  if (id === 'fedora' && version === '46') return PACKAGES.fedora46
  if (id === 'opensuse-tumbleweed') return PACKAGES.tumbleweed
  if (id === 'arch') return PACKAGES.arch
  return PACKAGES.flatpak
}
