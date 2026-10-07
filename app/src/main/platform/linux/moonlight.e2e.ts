import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from '../windows/download'
import { ensureMoonlightLinux } from './moonlight'
import { MOONLIGHT_LINUX_APPIMAGE } from './versions'
import { shQuote } from './setup'

/** Só no Linux: baixa o Moonlight de verdade, confere o hash e abre o AppImage como o app faz. */
describe.runIf(process.platform === 'linux')('Moonlight no Linux de verdade', () => {
  it('baixa o AppImage fixado, deixa executável e ele responde sem precisar de FUSE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hz-moonlight-'))
    const path = await ensureMoonlightLinux({
      dir,
      artifact: MOONLIGHT_LINUX_APPIMAGE,
      exists: async (p) => {
        try {
          execFileSync('test', ['-e', p])
          return true
        } catch {
          return false
        }
      },
      download: downloadVerified,
      run: async (script) => void execFileSync('sh', ['-c', script])
    })
    const out = execFileSync('sh', ['-c', `${shQuote(path)} --help 2>&1`], {
      env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' },
      timeout: 120_000
    }).toString()
    console.log(out)
    expect(out.toLowerCase()).toMatch(/moonlight|usage|uso/)
  }, 300_000)
})
