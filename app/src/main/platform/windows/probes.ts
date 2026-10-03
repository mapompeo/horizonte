import { execFile } from 'node:child_process'
import type { InstallProbe } from './setup'

/** Roda um trecho de PowerShell sem privilégios e devolve o que ele escreveu. */
export type PowerShellRunner = (script: string, timeoutMs?: number) => Promise<string>

export const runPowerShell: PowerShellRunner = (script, timeoutMs = 20_000) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true },
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
    sunshineResponding: async () =>
      (await ask(
        '[bool](Get-NetTCPConnection -LocalPort 47990 -State Listen -ErrorAction SilentlyContinue)'
      )) === 'True',
    serviceControllable: async () =>
      // O padrão do Windows já traz uma regra para IU (só leitura); o que importa é ela poder parar (WP).
      /[(]A;;[A-Z]*WP[A-Z]*;;;IU[)]/.test(await ask('(sc.exe sdshow SunshineService) -join " "')),
    driverPresent: async () =>
      (await ask(
        "[bool](Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.HardwareID -contains 'Root\\MttVDD' -or $_.FriendlyName -match 'Virtual Display Driver|VDD by MTT' })"
      )) === 'True'
  }
}
