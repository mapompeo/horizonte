import { execFile } from 'node:child_process'

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
