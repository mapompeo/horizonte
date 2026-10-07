import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from '../windows/download'
import { sunshineDmgFor } from './versions'
import { createMoonlightLauncher } from './wire'

/** Só no macOS. Prova o que o código assumia sem nunca ter rodado num Mac. */
describe.runIf(process.platform === 'darwin')('macOS de verdade', () => {
  it('Moonlight: baixa, confere o hash, instala e acha o executável pelo Info.plist', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'hz-mac-'))
    const launcher = createMoonlightLauncher(userData)

    const exe = await launcher()
    console.log('executável do Moonlight:', exe)
    expect(existsSync(exe)).toBe(true)
    expect(statSync(exe).mode & 0o111).not.toBe(0) // é executável
    expect(exe).toContain(join(userData, 'moonlight', 'Moonlight.app'))

    // Segunda vez: já está instalado, devolve o mesmo caminho sem baixar de novo.
    const started = Date.now()
    expect(await launcher()).toBe(exe)
    expect(Date.now() - started).toBeLessThan(5_000)

    // O disco foi desmontado: nada fica montado atrás.
    expect(execFileSync('hdiutil', ['info']).toString()).not.toContain('Moonlight-6.1.0.dmg')
  })

  it('Sunshine: o disco tem o app com o nome e o binário que o instalador assume', async () => {
    const dmg = sunshineDmgFor(process.arch)
    const file = join(mkdtempSync(join(tmpdir(), 'hz-mac-')), dmg.fileName)
    await downloadVerified(dmg, file)
    const mnt = mkdtempSync(join(tmpdir(), 'hz-mnt-'))
    execFileSync('hdiutil', [
      'attach',
      file,
      '-nobrowse',
      '-readonly',
      '-quiet',
      '-mountpoint',
      mnt
    ])
    try {
      const apps = readdirSync(mnt).filter((name) => name.endsWith('.app'))
      console.log('apps dentro do disco do Sunshine:', apps)
      expect(apps).toContain('Sunshine.app')
      const macos = join(mnt, 'Sunshine.app', 'Contents', 'MacOS')
      console.log('conteúdo de Contents/MacOS:', readdirSync(macos))
      expect(existsSync(join(macos, 'sunshine'))).toBe(true)
    } finally {
      execFileSync('hdiutil', ['detach', mnt, '-quiet'])
    }
  })
})
