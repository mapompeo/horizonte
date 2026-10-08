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

  it('vincula o driver mesmo quando o dispositivo já existe sem driver', () => {
    const body = DRIVER_INSTALL_SCRIPT.slice(DRIVER_INSTALL_SCRIPT.indexOf('$thumb ='))
    const harness = String.raw`
Add-Type -TypeDefinition 'public static class HzDev { public static int Calls; public static bool UpdateDriverForPlugAndPlayDevicesW(System.IntPtr h, string id, string inf, int flags, out bool reboot) { Calls++; reboot=false; return true; } }'
function Get-PfxCertificate { [pscustomobject]@{ Thumbprint='fixture' } }
function Test-Path { $true }
function Import-Certificate { }
function pnputil.exe { $global:LASTEXITCODE=0 }
function Get-PnpDevice { [pscustomobject]@{ HardwareID=@('Root\MttVDD'); Class=$null; Status='OK' } }
$inf=[pscustomobject]@{ FullName='fixture.inf' }
$cer=[pscustomobject]@{ FullName='fixture.cer' }
`
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodeCommand(harness + body + '\n[HzDev]::Calls')
      ],
      { encoding: 'utf8' }
    )
    expect(out.trim()).toBe('1')
  })
})
