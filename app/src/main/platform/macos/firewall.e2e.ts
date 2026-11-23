import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parseMacFirewall, SOCKETFILTERFW } from './firewall'

const ask = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(SOCKETFILTERFW, args, { timeout: 10_000 }, (error, out) =>
      error ? reject(error) : resolve(String(out))
    )
  )

describe.runIf(process.platform === 'darwin')('firewall do macOS de verdade', () => {
  it('lê o estado sem administrador e entende o que o sistema responde', async () => {
    const global = await ask(['--getglobalstate'])
    const app = await ask(['--getappblocked', '/System/Applications/Calculator.app'])
    console.log('firewall:', global.trim(), '|', app.trim())
    expect(global).toMatch(/Firewall is (enabled|disabled)/)
    expect(['allowed', 'blocked', 'unknown']).toContain(parseMacFirewall(global, app))
  })
})
