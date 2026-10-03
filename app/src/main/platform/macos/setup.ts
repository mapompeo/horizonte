import { posix } from 'node:path'

const join = posix.join
import type { PrepProgress } from '../../../shared/types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import type { Artifact } from '../windows/download'
import type { PinnedArtifact } from '../windows/versions'
import { shQuote } from '../linux/setup'

const USERNAME = 'horizonte'
const DOWNLOAD_SHARE = 0.6
const INSTALL_SHARE = 0.85

export const SCREEN_RECORDING_PANE =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

export const ONE_SCREEN_MESSAGE =
  'Este Mac só tem uma tela, e o macOS não cria monitor virtual sozinho. Para estender a tela, conecte um plugue HDMI "dummy" ou instale o BetterDisplay (ele cria um monitor virtual), e abra o Horizonte de novo.'

export interface MacProbe {
  sunshineInstalled(): Promise<boolean>
  sunshineResponding(): Promise<boolean>
  /** Quantas telas o Mac enxerga agora (reais ou virtuais). */
  displayCount(): Promise<number>
}

export interface MacSetupDeps {
  probe: MacProbe
  vault: {
    load(): Promise<SunshineCredentials | null>
    save(credentials: SunshineCredentials): Promise<void>
  }
  download(
    artifact: Artifact & { fileName?: string },
    dest: string,
    onProgress?: (fraction: number) => void
  ): Promise<void>
  /** Roda um roteiro no `sh`, como a própria pessoa (nada no Mac exige administrador aqui). */
  run(script: string): Promise<void>
  dmgForThisMac(): PinnedArtifact
  waitForApi(): Promise<void>
  generatePassword(): string
  workDir: string
  /** Pasta de aplicativos da pessoa (`~/Applications`): instalar nela dispensa administrador. */
  appsDir: string
  port: number
}

export function createMacSetup(deps: MacSetupDeps): {
  installer: EngineInstaller
  display: VirtualDisplay
} {
  let report: (progress: PrepProgress) => void = () => undefined
  const app = join(deps.appsDir, 'Sunshine.app')
  const binary = join(app, 'Contents', 'MacOS', 'sunshine')

  async function run(): Promise<void> {
    const [installed, responding, stored, screens] = await Promise.all([
      deps.probe.sunshineInstalled(),
      deps.probe.sunshineResponding(),
      deps.vault.load(),
      deps.probe.displayCount()
    ])
    if (screens < 2) throw new Error(ONE_SCREEN_MESSAGE)

    const needInstall = !installed
    const needCredentials = needInstall || stored === null
    const needStart = !responding

    if (needInstall) {
      const dmg = deps.dmgForThisMac()
      const file = join(deps.workDir, dmg.fileName)
      report({ note: 'Baixando o motor de transmissão', fraction: 0 })
      await deps.download(dmg, file, (f) =>
        report({ note: 'Baixando o motor de transmissão', fraction: f * DOWNLOAD_SHARE })
      )
      report({ note: 'Instalando o motor de transmissão', fraction: DOWNLOAD_SHARE })
      await deps.run(
        [
          'set -e',
          'mnt=$(mktemp -d)',
          'trap \'hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true\' EXIT',
          `hdiutil attach ${shQuote(file)} -nobrowse -readonly -quiet -mountpoint "$mnt"`,
          `mkdir -p ${shQuote(deps.appsDir)}`,
          `rm -rf ${shQuote(app)}`,
          `cp -R "$mnt/Sunshine.app" ${shQuote(app)}`
        ].join('\n')
      )
    }

    let credentials: SunshineCredentials | null = stored
    if (needCredentials) {
      credentials = { username: USERNAME, password: deps.generatePassword(), port: deps.port }
      await deps.run(
        `${shQuote(binary)} --creds ${shQuote(credentials.username)} ${shQuote(credentials.password)}`
      )
      await deps.vault.save(credentials)
    }

    if (needInstall || needCredentials || needStart) {
      report({
        note: 'Ligando o motor. Se o Mac pedir, permita a gravação de tela',
        fraction: INSTALL_SHARE,
        permission: true
      })
      // Um Sunshine já aberto precisa fechar para ler a senha nova; `open` abre o aplicativo do usuário.
      await deps.run(`pkill -x sunshine || true\nopen ${shQuote(app)}`)
      await deps.run(`open ${shQuote(SCREEN_RECORDING_PANE)}`).catch(() => undefined)
      await deps.waitForApi()
    }
    report({ note: 'Motor pronto', fraction: 1 })
  }

  let inFlight: Promise<void> | null = null
  const ensure = (onReport?: (progress: PrepProgress) => void): Promise<void> => {
    if (onReport) report = onReport
    inFlight ??= run().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    installer: { ensureInstalled: (r) => ensure(r) },
    display: {
      ensureVirtualDisplay: () => ensure(),
      // No Mac o monitor virtual é de outro programa (BetterDisplay) ou um plugue: vale qualquer tela que não seja a principal.
      isVirtual: (display: SunshineDisplay) => !display.primary
    }
  }
}
