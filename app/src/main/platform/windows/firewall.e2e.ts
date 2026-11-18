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
  it('bloqueado (o Cancelar) ou em rede Pública: Liberar deixa liberado e a rede privada', async () => {
    const exe = 'C:\\Horizonte-teste\\Horizonte.exe'
    const block = `New-NetFirewallRule -DisplayName 'Horizonte teste' -Direction Inbound -Action Block -Program '${exe}' | Out-Null`
    try {
      await powershell('Set-NetFirewallProfile -Name Private -Enabled True')
      // A máquina da CI pode começar com a rede Pública: os dois valem antes de qualquer regra.
      const first = parseFirewallState(await powershell(firewallStateScript(exe)))
      console.log('firewall antes:', first)
      expect(['unknown', 'public']).toContain(first)
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
