import { posix } from 'node:path'

const join = posix.join
import type { PrepProgress } from '../../../shared/types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import { createSetupTask, setupStep } from '../types'
import type { Artifact } from '../windows/download'
import type { PinnedArtifact } from '../windows/versions'
import { sessionKind, WAYLAND_MESSAGE } from './session'

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
  /** Pacote do motor para este Ubuntu; erra com uma frase clara se não houver. */
  debForThisSystem(): PinnedArtifact
  env: Record<string, string | undefined>
  waitForApi(): Promise<void>
  generatePassword(): string
  workDir: string
  port: number
}

/**
 * Monitor virtual só em Xorg: aumenta a área da tela e cria um monitor 1920x1080 à direita do atual
 * (`xrandr --setmonitor`). Não sobrevive ao fim da sessão, por isso é refeito a cada preparação.
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
  async function run(
    report: (progress: PrepProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted()
    const step = <T>(action: () => Promise<T>): Promise<T> => setupStep(signal, action)
    if (sessionKind(deps.env) === 'wayland') throw new Error(WAYLAND_MESSAGE)

    const [installed, active, responding, stored, monitor] = await step(() =>
      Promise.all([
        deps.probe.sunshineInstalled(),
        deps.probe.serviceActive(),
        deps.probe.sunshineResponding(),
        deps.vault.load(),
        deps.probe.monitorPresent()
      ])
    )
    const needInstall = !installed
    const needCredentials = needInstall || stored === null
    const needStart = !active || !responding

    if (needInstall) {
      const deb = deps.debForThisSystem()
      const file = join(deps.workDir, deb.fileName)
      report({ note: 'Baixando o motor de transmissão', fraction: 0 })
      await step(() =>
        deps.download(
          deb,
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
            'mkdir -p "$stage"',
            `install -m 600 ${shQuote(file)} "$stage/pacote.deb"`,
            `echo ${shQuote(`${deb.sha256}  `)}"$stage/pacote.deb" | sha256sum -c - >/dev/null`,
            'DEBIAN_FRONTEND=noninteractive apt-get install -y "$stage/pacote.deb"',
            'rm -rf "$stage"'
          ].join('\n')
        )
      )
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

    if (!monitor) await step(() => deps.runUser(VIRTUAL_MONITOR_SCRIPT))
    report({ note: 'Motor pronto', fraction: 1 })
  }

  const ensure = createSetupTask(run)

  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(undefined, signal),
      isVirtual: (display: SunshineDisplay) => display.friendlyName.includes(MONITOR_NAME)
    }
  }
}
