import { win32 } from 'node:path'
import type { PrepProgress } from '../../../shared/types'
import type { EngineInstaller, SunshineCredentials, VirtualDisplay } from '../types'
import type { SunshineDisplay } from '../../engine/sunshine/log'
import type { Artifact } from './download'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'
import { psQuote, type ElevatedStep, type Elevation } from './elevation'
import { SUNSHINE, VIRTUAL_DISPLAY_DRIVER, type PinnedArtifact } from './versions'

import { PIN_CHANNEL_PORT } from '../../engine/pin-channel'

export const FIREWALL_RULE = 'Horizonte (pareamento)'

export interface InstallProbe {
  sunshineRunning(): Promise<boolean>
  /** O painel do Sunshine (porta 47990) está aceitando conexões. O serviço pode estar rodando e preso. */
  sunshineResponding(): Promise<boolean>
  /** A pessoa comum pode reiniciar o serviço sem pedir administrador (permissão dada na instalação). */
  serviceControllable(): Promise<boolean>
  driverPresent(): Promise<boolean>
  /** A regra do firewall para o canal de PIN do Horizonte (rede local) já existe. */
  pairingPortOpen?(): Promise<boolean>
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
}

const USERNAME = 'horizonte'

/** Parte da etapa gasta baixando; depois vêm a instalação (até INSTALL_SHARE) e a espera do motor ligar. */
const DOWNLOAD_SHARE = 0.6
const INSTALL_SHARE = 0.9

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

  let report: (progress: PrepProgress) => void = () => undefined

  async function run(): Promise<void> {
    const [running, responding, controllable, driverPresent, stored, portOpen] = await Promise.all([
      deps.probe.sunshineRunning(),
      deps.probe.sunshineResponding(),
      deps.probe.serviceControllable(),
      deps.probe.driverPresent(),
      deps.vault.load(),
      deps.probe.pairingPortOpen?.() ?? Promise.resolve(true)
    ])
    const needSunshine = !running
    const needCredentials = needSunshine || stored === null
    const needDriver = !driverPresent
    // Serviço "rodando" mas sem atender: preso depois de um reinício. Reiniciar de novo costuma resolver.
    const needRestart = !needSunshine && !needCredentials && !responding
    // O Horizonte precisa reiniciar o serviço sozinho nas próximas vezes, sem pedir administrador de novo.
    const needAccess = needSunshine || !controllable
    const needFirewall = !portOpen
    if (!needSunshine && !needCredentials && !needDriver && !needRestart && !needAccess && !needFirewall) return

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
      const what = artifact === SUNSHINE ? 'o motor de transmissão' : 'o monitor virtual'
      await deps.download(artifact, dest, (fraction) =>
        report({
          note: `Baixando ${what}`,
          fraction: ((index + fraction) / downloads.length) * DOWNLOAD_SHARE
        })
      )
    }

    const credentials: SunshineCredentials = needCredentials
      ? { username: USERNAME, password: deps.generatePassword(), port: deps.port }
      : (stored as SunshineCredentials)

    const steps: ElevatedStep[] = []
    if (needSunshine) {
      steps.push({
        description: 'Instalar o motor de transmissão',
        script: [
          ...stage(SUNSHINE, paths.get(SUNSHINE.fileName) as string, 'msi'),
          `$p = Start-Process -FilePath msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart' -Wait -PassThru`,
          'if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "msiexec terminou com o código $($p.ExitCode)" }'
        ].join('\n')
      })
    }
    if (needAccess) {
      steps.push({
        description: 'Permitir que o Horizonte reinicie o motor',
        script: [
          `$sddl = (sc.exe sdshow SunshineService | Where-Object { $_ -match '^D:' }) -join ''`,
          `if (-not $sddl) { throw 'Não consegui ler as permissões do serviço.' }`,
          `if ($sddl -notmatch '[(]A;;[A-Z]*WP[A-Z]*;;;IU[)]') {`,
          `  sc.exe sdset SunshineService ('D:(A;;RPWPLCLORC;;;IU)' + $sddl.Substring(2)) | Out-Null`,
          nativeCheck('sc sdset'),
          '}'
        ].join('\n')
      })
    }
    if (needFirewall) {
      steps.push({
        description: 'Liberar o pareamento na rede local',
        script: `New-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -Direction Inbound -Protocol TCP -LocalPort ${PIN_CHANNEL_PORT} -Profile Private -Action Allow | Out-Null`
      })
    }
    if (needCredentials) {
      steps.push({
        description: 'Criar o acesso do Horizonte ao motor',
        script: [
          `& ${psQuote(sunshineExe)} ${psQuote(sunshineConf)} --creds ${psQuote(credentials.username)} ${psQuote(credentials.password)}`,
          nativeCheck('sunshine --creds'),
          'Restart-Service -Name SunshineService -ErrorAction Stop'
        ].join('\n')
      })
    }
    if (needRestart) {
      steps.push({
        description: 'Reiniciar o motor',
        script: 'Restart-Service -Name SunshineService -ErrorAction Stop'
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

    report({
      note: needSunshine
        ? 'Instalando o motor de transmissão (confirme o aviso do Windows)'
        : needDriver
          ? 'Instalando o monitor virtual (confirme o aviso do Windows)'
          : 'Ajustando o motor (confirme o aviso do Windows)',
      fraction: DOWNLOAD_SHARE,
      permission: true
    })
    await deps.elevation.runElevated(steps)
    if (needCredentials) await deps.vault.save(credentials)
    if (needSunshine || needCredentials || needRestart) {
      report({ note: 'Esperando o motor ligar', fraction: INSTALL_SHARE })
      await deps.waitForApi()
    }
    report({ note: 'Motor pronto', fraction: 1 })
  }

  // Duas chamadas ao mesmo tempo (instalador e monitor) compartilham UMA preparação e UM pedido de administrador.
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
      isVirtual: (display: SunshineDisplay) => /vdd|virtual/i.test(display.friendlyName)
    }
  }
}
