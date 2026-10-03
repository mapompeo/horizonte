import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { encodeCommand } from './elevation'
import { DRIVER_INSTALL_SCRIPT } from './driver-script'

describe.runIf(process.platform === 'win32')('roteiro do driver no PowerShell de verdade', () => {
  it('não tem erro de sintaxe (só analisa, não executa nada)', () => {
    const checker =
      '$e = $null; $t = $null; ' +
      '$s = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:HZ_SCRIPT)); ' +
      '[void][Management.Automation.Language.Parser]::ParseInput($s, [ref]$t, [ref]$e); ' +
      'Write-Output $e.Count'
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', checker],
      {
        env: { ...process.env, HZ_SCRIPT: encodeCommand(DRIVER_INSTALL_SCRIPT) },
        encoding: 'utf8'
      }
    )
    expect(out.trim()).toBe('0')
  })

  it('o dispositivo é criado com o ID de hardware do INF e a raiz é removida no finally', () => {
    expect(DRIVER_INSTALL_SCRIPT).toContain('Root\\MttVDD')
    expect(DRIVER_INSTALL_SCRIPT).toMatch(/finally \{\s*if \(-not \$rootWasThere\)/)
  })
})
