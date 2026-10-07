import { posix } from 'node:path'

const join = posix.join
import type { PrepProgress } from '../../../shared/types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import { createSetupTask, setupStep } from '../types'
import type { Artifact } from '../windows/download'
import type { PinnedArtifact } from '../windows/versions'
import { shQuote } from '../linux/setup'

const USERNAME = 'horizonte'
const DOWNLOAD_SHARE = 0.6
const INSTALL_SHARE = 0.85

/** O executável e o processo do app no Mac (visto no disco do Sunshine, numa execução real na CI): com S maiúsculo. */
export const SUNSHINE_PROCESS = 'Sunshine'

export const SCREEN_RECORDING_PANE =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

export const ONE_SCREEN_MESSAGE =
  'Este Mac só tem uma tela, e o macOS não cria monitor virtual sozinho. Para estender a tela, conecte um plugue HDMI "dummy" ou instale o BetterDisplay (ele cria um monitor virtual), e abra o Horizonte de novo.'

export const VIRTUAL_DISPLAY_FAILED_MESSAGE =
  'Não consegui criar o monitor virtual neste Mac. Conecte um plugue HDMI "dummy" ou instale o BetterDisplay (ele cria um monitor virtual), e abra o Horizonte de novo.'

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
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal
  ): Promise<void>
  /** Roda um roteiro no `sh`, como a própria pessoa (nada no Mac exige administrador aqui). */
  run(script: string): Promise<void>
  dmgForThisMac(): PinnedArtifact
  waitForApi(): Promise<void>
  generatePassword(): string
  sleep(ms: number): Promise<void>
  /**
   * Cria o monitor virtual próprio do Horizonte (o auxiliar horizonte-display) e devolve quando ele já está
   * rodando. Ausente quando o auxiliar não existe (por exemplo, rodando do código-fonte sem compilá-lo).
   */
  startVirtualDisplay?(): Promise<void>
  workDir: string
  /** Pasta de aplicativos da pessoa (`~/Applications`): instalar nela dispensa administrador. */
  appsDir: string
  port: number
}

export function createMacSetup(deps: MacSetupDeps): {
  installer: EngineInstaller
  display: VirtualDisplay
} {
  const app = join(deps.appsDir, 'Sunshine.app')
  const binary = join(app, 'Contents', 'MacOS', SUNSHINE_PROCESS)

  async function run(
    report: (progress: PrepProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const step = <T>(action: () => Promise<T>): Promise<T> => setupStep(signal, action)
    const [installed, responding, stored, screens] = await step(() =>
      Promise.all([
        deps.probe.sunshineInstalled(),
        deps.probe.sunshineResponding(),
        deps.vault.load(),
        deps.probe.displayCount()
      ])
    )
    let screenCount = screens
    if (screenCount < 2) {
      // Sem uma segunda tela o Sunshine só espelha a principal: o Horizonte cria o monitor virtual sozinho.
      if (!deps.startVirtualDisplay) throw new Error(ONE_SCREEN_MESSAGE)
      report({ note: 'Criando o monitor virtual', fraction: 0 })
      try {
        await step(() => deps.startVirtualDisplay!())
      } catch (cause) {
        signal?.throwIfAborted()
        const detail = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`${VIRTUAL_DISPLAY_FAILED_MESSAGE} (${detail})`)
      }
      // O macOS leva um instante para mostrar a tela nova.
      for (let attempt = 0; attempt < 20 && screenCount < 2; attempt += 1) {
        await step(() => deps.sleep(500))
        screenCount = await step(() => deps.probe.displayCount())
      }
      if (screenCount < 2) throw new Error(VIRTUAL_DISPLAY_FAILED_MESSAGE)
    }

    const needInstall = !installed
    const needCredentials = needInstall || stored === null
    const needStart = !responding

    if (needInstall) {
      const dmg = deps.dmgForThisMac()
      const file = join(deps.workDir, dmg.fileName)
      report({ note: 'Baixando o motor de transmissão', fraction: 0 })
      await step(() =>
        deps.download(
          dmg,
          file,
          (f) => report({ note: 'Baixando o motor de transmissão', fraction: f * DOWNLOAD_SHARE }),
          signal
        )
      )
      report({ note: 'Instalando o motor de transmissão', fraction: DOWNLOAD_SHARE })
      await step(() =>
        deps.run(
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
        deps.run(
          `${shQuote(binary)} --creds ${shQuote(credentials.username)} ${shQuote(credentials.password)}`
        )
      )
      await step(() => deps.vault.save(credentials))
    }

    if (needInstall || needCredentials || needStart) {
      report({
        note: 'Ligando o motor. Se o Mac pedir, permita a gravação de tela',
        fraction: INSTALL_SHARE,
        permission: true
      })
      // Um Sunshine já aberto precisa fechar para ler a senha nova; `open` abre o aplicativo do usuário.
      await step(() => deps.run(`pkill -x ${SUNSHINE_PROCESS} || true\nopen ${shQuote(app)}`))
      await step(() => deps.run(`open ${shQuote(SCREEN_RECORDING_PANE)}`).catch(() => undefined))
      await step(() => deps.waitForApi())
    }
    report({ note: 'Motor pronto', fraction: 1 })
  }

  const ensure = createSetupTask(run)

  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(undefined, signal),
      // No Mac o monitor virtual é de outro programa (BetterDisplay) ou um plugue: vale qualquer tela que não seja a principal.
      isVirtual: (display: SunshineDisplay) => !display.primary
    }
  }
}
