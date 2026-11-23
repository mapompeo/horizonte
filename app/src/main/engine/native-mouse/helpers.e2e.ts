import { execFile, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const windows = process.platform === 'win32'
const mac = process.platform === 'darwin'
const HELPER = resolve(
  windows ? 'native/windows/build/horizonte-mouse.exe' : 'native/macos/build/horizonte-mouse'
)

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Onde o cursor está, pelo próprio Windows. */
function cursor(): Promise<{ x: number; y: number }> {
  return new Promise((done, fail) =>
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; "$($p.X) $($p.Y)"; [System.Windows.Forms.SystemInformation]::VirtualScreen.Left; [System.Windows.Forms.SystemInformation]::VirtualScreen.Top'
      ],
      (error, out) => {
        if (error) return fail(error)
        const [pos = '', left = '0', top = '0'] = String(out).trim().split(/\r?\n/)
        const [x, y] = pos.split(' ').map(Number)
        done({ x: (x ?? 0) - Number(left), y: (y ?? 0) - Number(top) })
      }
    )
  )
}

describe.runIf(windows)('auxiliar de mouse do Windows de verdade', () => {
  it('existe, passa no --check, lista as telas e move o cursor', async () => {
    expect(existsSync(HELPER), 'o auxiliar foi compilado').toBe(true)
    expect(spawnSync(HELPER, ['--check']).status).toBe(0)

    // Captura: anuncia as telas (ZONE ... e depois ZONES) e fica pronto.
    const capture = spawn(HELPER, ['--capture'])
    let out = ''
    capture.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    for (let i = 0; i < 50 && !/ZONES/.test(out); i++) await wait(100)
    capture.stdin.end()
    capture.kill()
    console.log('captura:', JSON.stringify(out))
    expect(out).toMatch(/ZONE \d+ \d+ -?\d+ -?\d+/)
    expect(out).toMatch(/ZONES/)

    // Injeção: "warp" leva o cursor ao ponto pedido da área de trabalho.
    const inject = spawn(HELPER, ['--inject'])
    let ready = ''
    inject.stdout.on('data', (chunk: Buffer) => (ready += chunk.toString()))
    for (let i = 0; i < 50 && !/READY/.test(ready); i++) await wait(100)
    inject.stdin.write('warp 120 140\n')
    await wait(600)
    const at = await cursor()
    inject.stdin.write('move 30 -20\n')
    await wait(600)
    const moved = await cursor()
    inject.stdin.end()
    inject.kill()
    console.log('cursor:', at, '→', moved)
    expect(Math.abs(at.x - 120)).toBeLessThanOrEqual(2)
    expect(Math.abs(at.y - 140)).toBeLessThanOrEqual(2)
    expect(Math.abs(moved.x - at.x - 30)).toBeLessThanOrEqual(2)
    expect(Math.abs(moved.y - at.y + 20)).toBeLessThanOrEqual(2)
  })
})

describe.runIf(mac)('auxiliar de mouse do Mac de verdade', () => {
  it('existe e passa no --check; sem Acessibilidade, a captura recusa com mensagem clara', () => {
    expect(existsSync(HELPER), 'o auxiliar foi compilado').toBe(true)
    expect(spawnSync(HELPER, ['--check'], { timeout: 10_000 }).status).toBe(0)
    const capture = spawnSync(HELPER, ['--capture'], { input: '', timeout: 10_000 })
    const said = `${capture.stdout}${capture.stderr}`
    console.log('captura:', capture.status, JSON.stringify(said))
    // Com a permissão (máquina de alguém), ela anuncia as telas; na CI, recusa e explica.
    if (capture.status === 3) expect(said).toMatch(/Acessibilidade/)
    else expect(said).toMatch(/ZONES/)
  })
})
