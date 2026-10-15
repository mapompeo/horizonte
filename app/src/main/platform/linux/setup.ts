import { posix } from 'node:path'

const join = posix.join
import type { PrepProgress } from '../../../shared/types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import { createSetupTask, setupStep } from '../setup-task'
import type { Artifact } from '../windows/download'
import { sessionKind } from './session'
import type { LinuxPackage, PackageKind } from './versions'

/**
 * Nome real da unidade de serviço do usuário que o pacote instala (visto num Ubuntu de verdade, na CI). O alias
 * "sunshine.service" só existe depois de habilitar esta unidade: usar "sunshine" antes disso falha.
 */
export const SUNSHINE_UNIT = 'app-dev.lizardbyte.app.Sunshine.service'

export const MONITOR_NAME = 'HorizonteVirtual'
const USERNAME = 'horizonte'
const DOWNLOAD_SHARE = 0.6
const INSTALL_SHARE = 0.9

/** Literal de texto do shell: nada é interpretado dentro de aspas simples. */
export const shQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

export interface LinuxProbe {
  sunshineInstalled(): Promise<boolean>
  /** O serviço do Sunshine do usuário está ativo (systemd --user). */
  serviceActive(): Promise<boolean>
  sunshineResponding(): Promise<boolean>
  monitorPresent(): Promise<boolean>
  /** Sem firewall ativo, ou as portas do Sunshine já liberadas por este app. */
  firewallReady(): Promise<boolean>
}

export interface LinuxSetupDeps {
  probe: LinuxProbe
  vault: {
    load(): Promise<SunshineCredentials | null>
    save(credentials: SunshineCredentials): Promise<void>
  }
  download(
    artifact: Artifact & { fileName?: string },
    dest: string,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal
  ): Promise<void>
  /** Roda como administrador, com UM aviso do sistema (polkit). */
  runPrivileged(script: string): Promise<void>
  /** Roda como a própria pessoa, sem aviso. */
  runUser(script: string): Promise<void>
  /** Pacote do motor para esta distribuição; erra com uma frase clara se não houver. */
  packageForThisSystem(): LinuxPackage
  env: Record<string, string | undefined>
  waitForApi(): Promise<void>
  generatePassword(): string
  workDir: string
  port: number
}

/** Comando de cada gerenciador para instalar o arquivo local já conferido (sem perguntas). */
const INSTALL_COMMAND: Record<PackageKind, string> = {
  deb: 'DEBIAN_FRONTEND=noninteractive apt-get install -y "$stage/$pkg"',
  'rpm-dnf': 'dnf install -y --nogpgcheck "$stage/$pkg"',
  'rpm-zypper': 'zypper --non-interactive install --allow-unsigned-rpm "$stage/$pkg"',
  pacman: 'pacman -U --noconfirm "$stage/$pkg"'
}

/**
 * Com o firewall do Ubuntu (ufw) ligado, o outro dispositivo não alcança o Sunshine nem o Deskflow (24800, 47901). Libera só as portas dele e só
 * para as redes privadas (casa e escritório), nunca para a internet. Sem ufw ativo, não faz nada.
 */
export const FIREWALL_SCRIPT = [
  'if command -v ufw >/dev/null && systemctl is-active --quiet ufw; then',
  '  for net in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do',
  '    ufw allow from "$net" to any port 24800,47900,47901,47984,47989,48010 proto tcp',
  '    ufw allow from "$net" to any port 47998,47999,48000,48002,48010 proto udp',
  '  done',
  'fi'
].join('\n')

/** Marca que o firewall já foi tratado, para não pedir administrador de novo a cada abertura. */
export const MARK_FIREWALL =
  'mkdir -p ~/.config/horizonte && touch ~/.config/horizonte/firewall-ok-v2'

export const MIRROR_NOTE =
  'Sem monitor extra neste sistema: vou espelhar a tela principal no outro dispositivo.'

/**
 * Monitor virtual só em Xorg: aumenta a área da tela e cria um monitor 1920x1080 à direita do atual
 * (`xrandr --setmonitor`). Não sobrevive ao fim da sessão, por isso é refeito a cada preparação. Onde isso não
 * é possível (Wayland, ou um Xorg que recuse), o Horizonte espelha a tela principal em vez de falhar.
 */
export const VIRTUAL_MONITOR_SCRIPT = [
  'set -e',
  "size=$(xrandr --current | sed -n 's/^Screen 0:.*current \\([0-9]*\\) x \\([0-9]*\\).*/\\1 \\2/p')",
  'set -- $size',
  '[ -n "$1" ] || { echo "Não consegui ler o tamanho da tela" >&2; exit 1; }',
  'xrandr --fb $(($1 + 1920))x$(($2 > 1080 ? $2 : 1080))',
  `xrandr --setmonitor ${MONITOR_NAME} 1920/508x1080/286+$1+0 none`
].join('\n')

export function createLinuxSetup(deps: LinuxSetupDeps): {
  installer: EngineInstaller
  display: VirtualDisplay
} {
  /** Verdadeiro quando não há monitor virtual e a transmissão usa a tela principal (espelho). */
  let mirror = false

  async function run(
    report: (progress: PrepProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted()
    const step = <T>(action: () => Promise<T>): Promise<T> => setupStep(signal, action)

    const [installed, active, responding, stored, monitor, firewall] = await step(() =>
      Promise.all([
        deps.probe.sunshineInstalled(),
        deps.probe.serviceActive(),
        deps.probe.sunshineResponding(),
        deps.vault.load(),
        sessionKind(deps.env) === 'wayland' ? false : deps.probe.monitorPresent(),
        deps.probe.firewallReady()
      ])
    )
    const needInstall = !installed
    const needCredentials = needInstall || stored === null
    const needStart = !active || !responding

    if (needInstall) {
      const pkg = deps.packageForThisSystem()
      const file = join(deps.workDir, pkg.fileName)
      report({ note: 'Baixando o motor de transmissão', fraction: 0 })
      await step(() =>
        deps.download(
          pkg,
          file,
          (f) => report({ note: 'Baixando o motor de transmissão', fraction: f * DOWNLOAD_SHARE }),
          signal
        )
      )
      report({
        note: 'Instalando o motor de transmissão (confirme o aviso do sistema)',
        fraction: DOWNLOAD_SHARE,
        permission: true
      })
      // Copia para uma pasta só do administrador e confere o hash de novo antes de instalar.
      await step(() =>
        deps.runPrivileged(
          [
            'set -e',
            'stage=/var/lib/horizonte/stage',
            `pkg=${shQuote(pkg.fileName)}`,
            'mkdir -p "$stage"',
            `install -m 600 ${shQuote(file)} "$stage/$pkg"`,
            `echo ${shQuote(`${pkg.sha256}  `)}"$stage/$pkg" | sha256sum -c - >/dev/null`,
            INSTALL_COMMAND[pkg.kind],
            ...(firewall ? [] : [FIREWALL_SCRIPT]),
            'rm -rf "$stage"'
          ].join('\n')
        )
      )
    }

    if (!firewall) {
      if (!needInstall) {
        report({
          note: 'Liberando o motor no firewall (confirme o aviso do sistema)',
          fraction: DOWNLOAD_SHARE,
          permission: true
        })
        await step(() => deps.runPrivileged(['set -e', FIREWALL_SCRIPT].join('\n')))
      }
      await step(() => deps.runUser(MARK_FIREWALL))
    }

    if (needCredentials) {
      signal?.throwIfAborted()
      const credentials: SunshineCredentials = {
        username: USERNAME,
        password: deps.generatePassword(),
        port: deps.port
      }
      await step(() =>
        deps.runUser(
          `sunshine --creds ${shQuote(credentials.username)} ${shQuote(credentials.password)}`
        )
      )
      await step(() => deps.vault.save(credentials))
    }

    if (needInstall || needCredentials || needStart) {
      report({ note: 'Ligando o motor de transmissão', fraction: INSTALL_SHARE })
      // A senha nova só vale depois de reiniciar um serviço que já rodava.
      await step(() =>
        deps.runUser(
          needCredentials || (active && !responding)
            ? `systemctl --user enable ${SUNSHINE_UNIT} && systemctl --user restart ${SUNSHINE_UNIT}`
            : `systemctl --user enable --now ${SUNSHINE_UNIT}`
        )
      )
      await step(() => deps.waitForApi())
    }

    mirror = false
    if (sessionKind(deps.env) === 'wayland') mirror = true
    else if (!monitor) {
      try {
        await step(() => deps.runUser(VIRTUAL_MONITOR_SCRIPT))
      } catch {
        mirror = true
      }
    }
    if (mirror) report({ note: MIRROR_NOTE, fraction: 1 })
    else report({ note: 'Motor pronto', fraction: 1 })
  }

  const ensure = createSetupTask(run)

  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(undefined, signal),
      // No espelho, a "tela virtual" é a principal: a que está na origem do desktop.
      isVirtual: (display: SunshineDisplay) =>
        mirror
          ? display.primary || display.originX === 0
          : display.friendlyName.includes(MONITOR_NAME)
    }
  }
}
