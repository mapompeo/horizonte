/** Aviso de que falta o driver de vídeo da placa: sem ele, o vídeo é feito pelo processador e atrasa. */
export interface VideoHint {
  message: string
  /** Comando para instalar, quando a distribuição é conhecida. */
  command: string | null
}

export interface VideoDriverFacts {
  /** Fabricantes das placas (`/sys/class/drm/card*\/device/vendor`), como `0x8086`. */
  vendors: string[]
  /** Arquivos encontrados nas pastas de drivers VA-API (só os nomes). */
  drivers: string[]
  /** `ID` e `ID_LIKE` do `/etc/os-release`. */
  os: { id: string; like: string[] }
}

const INTEL = '0x8086'
const AMD = '0x1002'

type Family = 'debian' | 'fedora' | 'arch' | 'suse'

const PACKAGES: Record<'intel' | 'amd', Record<Family, string>> = {
  intel: {
    debian: 'intel-media-va-driver',
    fedora: 'intel-media-driver',
    arch: 'intel-media-driver',
    suse: 'intel-media-driver'
  },
  amd: {
    debian: 'mesa-va-drivers',
    fedora: 'mesa-va-drivers',
    arch: 'libva-mesa-driver',
    suse: 'libva-mesa-driver'
  }
}

const INSTALL: Record<Family, (pkg: string) => string> = {
  debian: (pkg) => `sudo apt install -y ${pkg}`,
  fedora: (pkg) => `sudo dnf install -y ${pkg}`,
  arch: (pkg) => `sudo pacman -S --needed ${pkg}`,
  suse: (pkg) => `sudo zypper install ${pkg}`
}

function family(os: VideoDriverFacts['os']): Family | null {
  const ids = [os.id, ...os.like].map((id) => id.toLowerCase())
  if (ids.some((id) => ['debian', 'ubuntu', 'linuxmint', 'pop'].includes(id))) return 'debian'
  if (ids.some((id) => ['fedora', 'rhel', 'centos'].includes(id))) return 'fedora'
  if (ids.some((id) => ['arch', 'manjaro', 'endeavouros'].includes(id))) return 'arch'
  if (ids.some((id) => id.includes('suse'))) return 'suse'
  return null
}

/**
 * Com placa Intel ou AMD e sem o driver VA-API dela, devolve o aviso. Com o driver, ou com outra placa (NVIDIA,
 * máquina virtual), não avisa nada: o Chromium decide sozinho.
 */
export function videoDriverHint(facts: VideoDriverFacts): VideoHint | null {
  const vendors = new Set(facts.vendors.map((v) => v.trim().toLowerCase()))
  const has = (...names: string[]): boolean => names.some((name) => facts.drivers.includes(name))
  const brand = vendors.has(INTEL)
    ? has('iHD_drv_video.so', 'i965_drv_video.so')
      ? null
      : 'intel'
    : vendors.has(AMD)
      ? has('radeonsi_drv_video.so')
        ? null
        : 'amd'
      : null
  if (!brand) return null
  const fam = family(facts.os)
  const pkg = fam ? PACKAGES[brand][fam] : null
  const name = brand === 'intel' ? 'Intel' : 'AMD'
  return {
    message:
      `Falta o driver de vídeo da placa ${name}. Sem ele, a imagem pode atrasar mais de 1 segundo.` +
      (pkg ? ` Instale o pacote ${pkg} e abra o Horizonte de novo.` : ''),
    command: fam && pkg ? INSTALL[fam](pkg) : null
  }
}

/** Lê o `/etc/os-release` (só `ID` e `ID_LIKE`). */
export function parseOsRelease(text: string): VideoDriverFacts['os'] {
  const value = (key: string): string =>
    new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]?.replace(/^["']|["']$/g, '') ?? ''
  return { id: value('ID'), like: value('ID_LIKE').split(/\s+/).filter(Boolean) }
}

/** Pastas onde as distribuições põem os drivers VA-API. */
export const DRIVER_DIRS = [
  '/usr/lib/x86_64-linux-gnu/dri',
  '/usr/lib/aarch64-linux-gnu/dri',
  '/usr/lib64/dri',
  '/usr/lib/dri'
]
