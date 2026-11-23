import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from './download'
import { attachScript, detachScript } from './placement'
import { VIRTUAL_DISPLAY_DRIVER } from './versions'
import { driverInstallScript, parseAttached } from './virtual-screen'

/** PowerShell de verdade (na máquina da CI ele já roda como administrador). */
function powershell(script: string, timeout = 180_000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) =>
        error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(String(stdout))
    )
  )
}

/** Telas ligadas na área de trabalho, segundo o próprio Windows. */
const activeScreens = async (): Promise<number> =>
  Number(
    (
      await powershell(
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count',
        30_000
      )
    ).trim()
  )

describe.runIf(process.platform === 'win32')('monitor virtual do Windows de verdade', () => {
  it('instala o driver, liga no tamanho pedido encostado à direita e desliga', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hz-vdd-'))
    const zip = join(dir, VIRTUAL_DISPLAY_DRIVER.fileName)
    await downloadVerified(VIRTUAL_DISPLAY_DRIVER, zip)
    // As telas de verdade, contadas antes do driver: ao instalar, ele já liga um monitor sozinho.
    const before = await activeScreens()
    console.log('telas antes:', before)
    console.log(await powershell(driverInstallScript(VIRTUAL_DISPLAY_DRIVER, zip), 300_000))

    // O driver leva um instante para aparecer depois de instalado: algumas tentativas.
    let attached: ReturnType<typeof parseAttached> = null
    let last = ''
    for (let tries = 0; tries < 10 && !attached; tries++) {
      last = await powershell(attachScript(1280, 720, 'right'), 60_000)
      attached = parseAttached(last)
      if (!attached) await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    console.log('ligar:', last.trim())
    if (!attached) {
      // Por que não ligou: o estado do dispositivo do driver e os adaptadores de vídeo que o Windows vê.
      console.log(
        await powershell(
          [
            "Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.HardwareID -contains 'Root\\MttVDD' -or $_.Class -eq 'Display' } | Format-List FriendlyName,Status,Problem,InstanceId,HardwareID | Out-String -Width 300",
            'Get-CimInstance Win32_VideoController | Format-List Name,Status,PNPDeviceID | Out-String -Width 300',
            "Get-ChildItem 'C:\\VirtualDisplayDriver' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName",
            'pnputil.exe /enum-drivers | Select-String -Context 0,6 MttVDD | Out-String -Width 300',
            // Repete a entrada do pacote com a saída à mostra, para ver a recusa do Windows.
            `$d = Join-Path $env:TEMP 'hz-vdd-diag'; Expand-Archive -LiteralPath '${zip}' -DestinationPath $d -Force`,
            '$inf = Get-ChildItem $d -Recurse -Filter MttVDD.inf | Select-Object -First 1; $cer = Get-ChildItem $d -Recurse -Filter *.cer | Select-Object -First 1',
            'pnputil.exe /add-driver $inf.FullName /install | Out-String -Width 300',
            '"pnputil saiu com $LASTEXITCODE"',
            'Get-WinEvent -LogName Microsoft-Windows-Kernel-PnP/Configuration -MaxEvents 8 -ErrorAction SilentlyContinue | Format-List TimeCreated,Id,Message | Out-String -Width 300',
            '(Get-CimInstance Win32_OperatingSystem).Caption',
            'exit 0'
          ].join('\n'),
          60_000
        )
      )
    }
    expect(attached, `o monitor virtual não ligou: ${last}`).not.toBeNull()
    // 1280x720 não está na lista que vem com o driver: o tamanho exato prova que ele aprendeu o tamanho do aparelho.
    expect([attached!.width, attached!.height], 'no tamanho exato pedido').toEqual([1280, 720])
    expect(attached!.x, 'encostado à direita das telas de verdade').toBeGreaterThan(0)
    expect(await activeScreens(), 'o Windows enxerga uma tela a mais').toBe(before + 1)

    const off = await powershell(detachScript(), 60_000)
    console.log('desligar:', off.trim())
    expect(await activeScreens(), 'a tela some ao desligar').toBe(before)
  })
})
