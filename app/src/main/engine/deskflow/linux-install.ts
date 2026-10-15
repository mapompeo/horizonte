import type { DeskflowCommand } from './session'
import type { DeskflowLinuxKind, DeskflowLinuxPackage } from './versions'

export const FLATPAK_APP = 'org.deskflow.deskflow'
/** O Flatpak só enxerga a pasta dos ajustes do Horizonte se ela for liberada na hora de rodar. */
const flatpak = (configDir: string): DeskflowCommand => ({
  command: 'flatpak',
  prefix: ['run', `--filesystem=${configDir}`, '--command=deskflow-core', FLATPAK_APP]
})
const NATIVE: DeskflowCommand = { command: 'deskflow-core', prefix: [] }

/** Literal de texto do shell: nada é interpretado dentro de aspas simples. */
const q = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

const INSTALL: Record<Exclude<DeskflowLinuxKind, 'flatpak'>, string> = {
  deb: 'DEBIAN_FRONTEND=noninteractive apt-get install -y "$stage/$pkg"',
  'rpm-dnf': 'dnf install -y --nogpgcheck "$stage/$pkg"',
  'rpm-zypper': 'zypper --non-interactive install --allow-unsigned-rpm "$stage/$pkg"',
  pacman: 'pacman -U --noconfirm "$stage/$pkg"'
}

/** Instala o Flatpak com o gerenciador que a distribuição tiver. */
export const INSTALL_FLATPAK = [
  'set -e',
  'if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y flatpak',
  'elif command -v dnf >/dev/null; then dnf install -y flatpak',
  'elif command -v zypper >/dev/null; then zypper --non-interactive install flatpak',
  'elif command -v pacman >/dev/null; then pacman -S --noconfirm flatpak',
  'else echo "Não sei instalar o Flatpak nesta distribuição." >&2; exit 1; fi'
].join('\n')

export interface LinuxDeskflowDeps {
  has(command: string): Promise<boolean>
  flatpakHasApp(): Promise<boolean>
  /** Pacote do Deskflow para esta distribuição (nativo ou Flatpak). */
  pkg(): DeskflowLinuxPackage
  /** Baixa conferindo o hash; em qualquer falha nada fica no destino. */
  download(pkg: DeskflowLinuxPackage, dest: string): Promise<void>
  /** Roda como administrador, com UM aviso do sistema (polkit). */
  runPrivileged(script: string): Promise<void>
  /** Roda como a própria pessoa, sem aviso. */
  runUser(script: string): Promise<void>
  workDir: string
  /** Pasta onde o Horizonte escreve os ajustes do Deskflow. */
  configDir: string
}

/** Garante o Deskflow no Linux e diz como chamá-lo. Cada caminho pede a senha do sistema no máximo uma vez. */
export async function ensureDeskflowLinux(deps: LinuxDeskflowDeps): Promise<DeskflowCommand> {
  if (await deps.has('deskflow-core')) return NATIVE
  if ((await deps.has('flatpak')) && (await deps.flatpakHasApp())) return flatpak(deps.configDir)

  const pkg = deps.pkg()
  const file = `${deps.workDir}/${pkg.fileName}`
  await deps.download(pkg, file)

  if (pkg.kind !== 'flatpak') {
    // Copia para uma pasta só do administrador e confere o hash de novo antes de instalar.
    await deps.runPrivileged(
      [
        'set -e',
        'stage=/var/lib/horizonte/stage',
        `pkg=${q(pkg.fileName)}`,
        'mkdir -p "$stage"',
        `install -m 600 ${q(file)} "$stage/$pkg"`,
        `echo ${q(`${pkg.sha256}  `)}"$stage/$pkg" | sha256sum -c - >/dev/null`,
        INSTALL[pkg.kind],
        'rm -f "$stage/$pkg"'
      ].join('\n')
    )
    return NATIVE
  }

  if (!(await deps.has('flatpak'))) await deps.runPrivileged(INSTALL_FLATPAK)
  // Na conta da pessoa, sem administrador; o Flathub entra para trazer a base que o Deskflow usa.
  await deps.runUser(
    [
      'set -e',
      'flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo',
      `flatpak install --user -y --noninteractive ${q(file)}`
    ].join('\n')
  )
  return flatpak(deps.configDir)
}
