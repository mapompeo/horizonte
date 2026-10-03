import { win32 } from 'node:path'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { Artifact } from './download'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'
import { psQuote, type ElevatedStep, type Elevation } from './elevation'
import { SUNSHINE, VIRTUAL_DISPLAY_DRIVER, type PinnedArtifact } from './versions'

export interface InstallProbe {
  sunshineRunning(): Promise<boolean>
  driverPresent(): Promise<boolean>
}

export interface SetupDeps {
  probe: InstallProbe
  vault: {
    load(): Promise<SunshineCredentials | null>
    save(credentials: SunshineCredentials): Promise<void>
  }
  download(
    artifact: Artifact & { fileName?: string },
    dest: string,
    onProgress?: (fraction: number) => void
  ): Promise<void>
  elevation: Elevation
  /**
   * O driver do monitor virtual tem certificado autoassinado: o Windows só o aceita se ele for confiado
   * como autoridade raiz durante a instalação. Devolve false se a pessoa não autorizar.
   */
  confirmDriverTrust(): Promise<boolean>
  /** Espera a API do Sunshine responder com a senha nova. */
  waitForApi(): Promise<void>
  generatePassword(): string
  /** Pasta temporária onde os downloads caem (a pessoa comum consegue escrever nela). */
  workDir: string
  sunshineDir: string
  port: number
  onProgress?: (fraction: number) => void
}

const USERNAME = 'horizonte'

/**
 * Os arquivos baixados ficam numa pasta que o usuário comum escreve. Antes de usar como administrador,
 * o roteiro copia para uma pasta do administrador e confere o hash da cópia, para ninguém trocar o
 * arquivo entre o download e a instalação.
 */
function stage(artifact: PinnedArtifact, downloaded: string, variable: string): string[] {
  return [
    `$stage = Join-Path $env:ProgramData 'Horizonte\\stage'`,
    'New-Item -ItemType Directory -Force -Path $stage | Out-Null',
    `$${variable} = Join-Path $stage ${psQuote(artifact.fileName)}`,
    `Copy-Item -LiteralPath ${psQuote(downloaded)} -Destination $${variable} -Force`,
    `if ((Get-FileHash -LiteralPath $${variable} -Algorithm SHA256).Hash -ne ${psQuote(artifact.sha256)}) { throw 'O arquivo mudou depois da conferência.' }`
  ]
}

const nativeCheck = (what: string, ok = '0'): string =>
  `if (${ok
    .split(',')
    .map((code) => `$LASTEXITCODE -ne ${code}`)
    .join(' -and ')}) { throw "${what} terminou com o código $LASTEXITCODE" }`

export function createWindowsSetup(deps: SetupDeps): {
  installer: EngineInstaller
  display: VirtualDisplay
} {
  const sunshineExe = win32.join(deps.sunshineDir, 'sunshine.exe')
  const sunshineConf = win32.join(deps.sunshineDir, 'config', 'sunshine.conf')

  async function run(): Promise<void> {
    const [running, driverPresent, stored] = await Promise.all([
      deps.probe.sunshineRunning(),
      deps.probe.driverPresent(),
      deps.vault.load()
    ])
    const needSunshine = !running
    const needCredentials = needSunshine || stored === null
    const needDriver = !driverPresent
    if (!needSunshine && !needCredentials && !needDriver) return

    if (needDriver && !(await deps.confirmDriverTrust())) {
      throw new Error(
        'Sem a sua autorização para o certificado do monitor virtual, não consigo instalá-lo.'
      )
    }

    const downloads: PinnedArtifact[] = []
    if (needSunshine) downloads.push(SUNSHINE)
    if (needDriver) downloads.push(VIRTUAL_DISPLAY_DRIVER)

    const paths = new Map<string, string>()
    for (const [index, artifact] of downloads.entries()) {
      const dest = win32.join(deps.workDir, artifact.fileName)
      paths.set(artifact.fileName, dest)
      await deps.download(artifact, dest, (fraction) =>
        deps.onProgress?.((index + fraction) / downloads.length)
      )
    }

    const credentials: SunshineCredentials = needCredentials
      ? { username: USERNAME, password: deps.generatePassword(), port: deps.port }
      : (stored as SunshineCredentials)

    const steps: ElevatedStep[] = []
    if (needSunshine) {
      steps.push({
        description: 'Instalar o Sunshine',
        script: [
          ...stage(SUNSHINE, paths.get(SUNSHINE.fileName) as string, 'msi'),
          `$p = Start-Process -FilePath msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart' -Wait -PassThru`,
          'if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "msiexec terminou com o código $($p.ExitCode)" }'
        ].join('\n')
      })
    }
    if (needCredentials) {
      steps.push({
        description: 'Criar o acesso do Horizonte ao Sunshine',
        script: [
          `& ${psQuote(sunshineExe)} ${psQuote(sunshineConf)} --creds ${psQuote(credentials.username)} ${psQuote(credentials.password)}`,
          nativeCheck('sunshine --creds'),
          'Restart-Service -Name SunshineService -ErrorAction Stop'
        ].join('\n')
      })
    }
    if (needDriver) {
      steps.push({
        description: 'Instalar o monitor virtual',
        script: [
          ...stage(
            VIRTUAL_DISPLAY_DRIVER,
            paths.get(VIRTUAL_DISPLAY_DRIVER.fileName) as string,
            'zip'
          ),
          `$dir = Join-Path $stage 'driver'`,
          'Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force',
          `$inf = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'MttVDD.inf' | Select-Object -First 1`,
          `$cer = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'Virtual_Display_Driver.cer' | Select-Object -First 1`,
          `if (-not $inf -or -not $cer) { throw 'O pacote do driver veio incompleto.' }`,
          DRIVER_INSTALL_SCRIPT
        ].join('\n')
      })
    }
    steps.push({
      description: 'Limpar arquivos temporários',
      script: `Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:ProgramData 'Horizonte\\stage') -ErrorAction SilentlyContinue`
    })

    await deps.elevation.runElevated(steps)
    if (needCredentials) await deps.vault.save(credentials)
    if (needSunshine || needCredentials) await deps.waitForApi()
    deps.onProgress?.(1)
  }

  // Duas chamadas ao mesmo tempo (instalador e monitor) compartilham UMA preparação e UM pedido de administrador.
  let inFlight: Promise<void> | null = null
  const ensure = (): Promise<void> => {
    inFlight ??= run().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: ensure,
      isVirtual: (display: SunshineDisplay) => /vdd|virtual/i.test(display.friendlyName)
    }
  }
}
