import { execFile } from 'node:child_process'
import type { InstallProbe } from './setup'

/** Roda um trecho de PowerShell sem privilégios e devolve o que ele escreveu. */
export type PowerShellRunner = (script: string) => Promise<string>

export const runPowerShell: PowerShellRunner = (script) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 20_000, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  })

/** Em caso de dúvida a resposta é "não está": instalar de novo é seguro, afirmar que existe não é. */
export function createProbe(run: PowerShellRunner): InstallProbe {
  const ask = async (script: string): Promise<string> => {
    try {
      return (await run(script)).trim()
    } catch {
      return ''
    }
  }
  return {
    sunshineRunning: async () =>
      (await ask('(Get-Service -Name SunshineService -ErrorAction SilentlyContinue).Status')) ===
      'Running',
    driverPresent: async () =>
      (await ask(
        "[bool](Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.HardwareID -contains 'Root\\MttVDD' -or $_.FriendlyName -match 'Virtual Display Driver|VDD by MTT' })"
      )) === 'True'
  }
}
