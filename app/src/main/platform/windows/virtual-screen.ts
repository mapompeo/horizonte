import type { ScreenRequest, VirtualScreen } from '../../engine/webrtc/display'
import type { MouseSide } from '../../../shared/types'
import { psQuote } from './elevation'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'
import { attachScript, detachScript, layoutScript, moveScript } from './placement'
import { parseLayout, targetFor } from './place-target'
import type { PinnedArtifact } from './versions'

/**
 * O roteiro (com administrador) que instala o driver de monitor virtual a partir do zip já baixado e conferido: copia
 * para uma pasta só do sistema, confere o hash de novo, extrai e instala.
 */
export function driverInstallScript(driver: PinnedArtifact, downloaded: string): string {
  return [
    // Antes de tudo: com o `PSModulePath` herdado do PowerShell 7, o Windows PowerShell não acha Get-FileHash nem
    // Expand-Archive, e a instalação parava em "o pacote do driver veio incompleto" (visto na CI do Windows).
    "$env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')",
    `$stage = Join-Path $env:ProgramData 'Horizonte\\stage'`,
    'New-Item -ItemType Directory -Force -Path $stage | Out-Null',
    `$zip = Join-Path $stage ${psQuote(driver.fileName)}`,
    `Copy-Item -LiteralPath ${psQuote(downloaded)} -Destination $zip -Force`,
    `if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne ${psQuote(driver.sha256)}) { throw 'O arquivo mudou depois da conferência.' }`,
    `$dir = Join-Path $stage 'driver'`,
    'Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force',
    `$inf = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'MttVDD.inf' | Select-Object -First 1`,
    `$cer = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'Virtual_Display_Driver.cer' | Select-Object -First 1`,
    `if (-not $inf -or -not $cer) { throw 'O pacote do driver veio incompleto.' }`,
    // Os ajustes do driver numa pasta que o app grava sem administrador: cada aparelho novo ensina o tamanho dele.
    `$cfg = 'C:\\VirtualDisplayDriver'`,
    'New-Item -ItemType Directory -Force -Path $cfg | Out-Null',
    `$xml = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'vdd_settings.xml' | Select-Object -First 1`,
    `if ($xml -and -not (Test-Path -LiteralPath (Join-Path $cfg 'vdd_settings.xml'))) { Copy-Item -LiteralPath $xml.FullName -Destination $cfg }`,
    // S-1-5-32-545: o grupo Usuários, pelo número (o nome muda com o idioma do Windows).
    `icacls.exe $cfg /grant '*S-1-5-32-545:(OI)(CI)M' | Out-Null`,
    DRIVER_INSTALL_SCRIPT,
    'Remove-Item -Recurse -Force -LiteralPath $stage -ErrorAction SilentlyContinue'
  ].join('\n')
}

/** "tela X Y LARGURA ALTURA" do roteiro de ligar; null quando o driver não está lá. */
export function parseAttached(
  out: string
): { x: number; y: number; width: number; height: number } | null {
  const match = /tela (-?\d+) (-?\d+) (\d+) (\d+)/.exec(out)
  if (!match) return null
  const [x, y, width, height] = match.slice(1).map(Number) as [number, number, number, number]
  return { x, y, width, height }
}

/**
 * Windows: a tela estendida é o monitor do driver de tela virtual (o único jeito de o Windows ganhar uma tela a mais).
 * Na primeira vez instala o driver (o Windows pede permissão uma vez); depois liga e desliga o monitor sem
 * administrador. O id é o da lista do Electron, achado pela posição em pixels do Windows.
 */
export function createWindowsVirtualScreen(deps: {
  run(script: string): Promise<string>
  /** Instala o driver (baixa, pede a autorização e roda com administrador). */
  installDriver(): Promise<void>
  /** O id da tela do Electron que começa neste ponto (pixels do Windows), ou null. */
  displayAt(x: number, y: number): number | null
  sleep(ms: number): Promise<void>
}): VirtualScreen {
  let side: MouseSide = 'right'
  let last: ScreenRequest | null = null

  const attach = async (request: ScreenRequest): Promise<number | null> => {
    let at = parseAttached(await deps.run(attachScript(request.width, request.height, side)))
    if (!at) {
      await deps.installDriver()
      at = parseAttached(await deps.run(attachScript(request.width, request.height, side)))
      if (!at) throw new Error('O monitor virtual não apareceu depois de instalar o driver.')
    }
    last = request
    // O Windows leva um instante para avisar a tela nova.
    for (let tries = 0; tries < 30; tries++) {
      const id = deps.displayAt(at.x, at.y)
      if (id !== null) return id
      await deps.sleep(100)
    }
    return null
  }

  return {
    ensure: attach,
    async release() {
      last = null
      await deps.run(detachScript())
    },
    async place(placement) {
      side = placement.side
      if (!last) return
      // Só o lado: o roteiro de ligar já resolve. Com deslocamento na borda ou posição livre do mapa, o app calcula o
      // ponto (nas telas de verdade que o Windows tem) e só move o monitor, sem religar nem mudar o tamanho.
      const custom =
        placement.offset !== undefined || (placement.x !== undefined && placement.y !== undefined)
      const layout = custom ? parseLayout(await deps.run(layoutScript())) : null
      if (!layout) return void (await attach(last))
      const target = targetFor(placement, layout)
      await deps.run(moveScript(target.x, target.y))
    }
  }
}
