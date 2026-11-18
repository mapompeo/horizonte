import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { firewallAllowScript, firewallStateScript, parseFirewallState } from './firewall'

/** PowerShell de verdade (na máquina da CI ele já roda como administrador). */
const powershell = (script: string): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 60_000 },
      (error, stdout, stderr) =>
        error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(String(stdout))
    )
  )

describe.runIf(process.platform === 'win32')('firewall do Windows de verdade', () => {
  it('um programa bloqueado (o Cancelar) passa a liberado em rede privada', async () => {
    const exe = 'C:\\Horizonte-teste\\Horizonte.exe'
    const block = `New-NetFirewallRule -DisplayName 'Horizonte teste' -Direction Inbound -Action Block -Program '${exe}' | Out-Null`
    try {
      await powershell('Set-NetFirewallProfile -Name Private -Enabled True')
      expect(parseFirewallState(await powershell(firewallStateScript(exe)))).toBe('unknown')
      await powershell(block)
      expect(parseFirewallState(await powershell(firewallStateScript(exe)))).toBe('blocked')
      await powershell(firewallAllowScript(exe))
      expect(parseFirewallState(await powershell(firewallStateScript(exe)))).toBe('allowed')
    } finally {
      await powershell(
        `Get-NetFirewallApplicationFilter -Program '${exe}' -ErrorAction SilentlyContinue | Get-NetFirewallRule | Remove-NetFirewallRule`
      )
    }
  })
})
