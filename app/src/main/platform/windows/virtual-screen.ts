import type { ScreenRequest, VirtualScreen } from '../../engine/webrtc/display'
import type { MouseSide } from '../../../shared/types'
import { psQuote } from './elevation'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'
import { attachScript, detachScript } from './placement'
import type { PinnedArtifact } from './versions'

/**
 * O roteiro (com administrador) que instala o driver de monitor virtual a partir do zip já baixado e conferido: copia
 * para uma pasta só do sistema, confere o hash de novo, extrai e instala.
 */
export function driverInstallScript(driver: PinnedArtifact, downloaded: string): string {
  return [
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
      if (last) await attach(last)
    }
  }
}
