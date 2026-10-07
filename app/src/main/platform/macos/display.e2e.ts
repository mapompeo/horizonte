import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HELPER = resolve('native/macos/build/horizonte-display')
/** Telas em uso segundo o próprio CoreGraphics (o system_profiler não lista nada em máquina virtual sem GPU). */
const screens = (): number =>
  Number(execFileSync(HELPER, ['--count'], { timeout: 30_000 }).toString().trim())
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function until(condition: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (condition()) return true
    await wait(1_000)
  }
  return condition()
}

/** Só no macOS, com o auxiliar já compilado (npm run build:helper:mac). */
describe.runIf(process.platform === 'darwin')('monitor virtual no Mac de verdade', () => {
  it('o auxiliar cria uma tela nova, o sistema a enxerga e ela some quando ele encerra', async () => {
    expect(existsSync(HELPER), 'o auxiliar foi compilado').toBe(true)
    console.log(execFileSync('lipo', ['-info', HELPER]).toString().trim())

    const before = screens()
    console.log('telas antes:', before)

    const child = spawn(HELPER, ['--width', '1920', '--height', '1080'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
    let exited: number | null = null
    child.on('exit', (code) => (exited = code ?? -1))

    try {
      const ready = await until(() => /DISPLAY_ID \d+/.test(out) || exited !== null, 30_000)
      console.log('saída do auxiliar:', JSON.stringify(out), 'erro:', JSON.stringify(err))
      expect(
        ready && /DISPLAY_ID \d+/.test(out),
        `o auxiliar disse que criou a tela (saiu: ${exited}): ${err}`
      ).toBe(true)

      const appeared = await until(() => screens() > before, 30_000)
      console.log('telas durante:', screens())
      console.log(execFileSync('system_profiler', ['SPDisplaysDataType']).toString().slice(0, 1500))
      expect(appeared, 'o sistema passou a enxergar uma tela a mais').toBe(true)
    } finally {
      child.kill('SIGTERM')
    }

    expect(await until(() => exited !== null, 15_000), 'o auxiliar encerra com SIGTERM').toBe(true)
    expect(exited).toBe(0)
    expect(await until(() => screens() <= before, 30_000), 'a tela some junto com o auxiliar').toBe(
      true
    )
  })
})
