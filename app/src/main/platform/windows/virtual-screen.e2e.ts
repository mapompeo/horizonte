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
    console.log(await powershell(driverInstallScript(VIRTUAL_DISPLAY_DRIVER, zip), 300_000))

    const before = await activeScreens()
    console.log('telas antes:', before)

    // O driver leva um instante para aparecer depois de instalado: algumas tentativas.
    let attached: ReturnType<typeof parseAttached> = null
    let last = ''
    for (let tries = 0; tries < 10 && !attached; tries++) {
      last = await powershell(attachScript(1280, 720, 'right'), 60_000)
      attached = parseAttached(last)
      if (!attached) await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    console.log('ligar:', last.trim())
    expect(attached, `o monitor virtual não ligou: ${last}`).not.toBeNull()
    expect(attached!.width).toBeGreaterThan(0)
    expect(attached!.x, 'encostado à direita das telas de verdade').toBeGreaterThan(0)
    expect(await activeScreens(), 'o Windows enxerga uma tela a mais').toBe(before + 1)

    const off = await powershell(detachScript(), 60_000)
    console.log('desligar:', off.trim())
    expect(await activeScreens(), 'a tela some ao desligar').toBe(before)
  })
})
