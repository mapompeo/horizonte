import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureMoonlight } from '../../engine/moonlight/install'
import { downloadVerified } from './download'
import { psQuote } from './elevation'
import { runPowerShell } from './probes'
import { MOONLIGHT } from './versions'

/** Só no Windows. */
describe.runIf(process.platform === 'win32')('Windows de verdade', () => {
  it('Moonlight portátil: baixa, confere o hash, extrai e acha o Moonlight.exe', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'hz-win-')), 'moonlight')
    const exe = await ensureMoonlight({
      dir,
      exists: async (path) => existsSync(path),
      download: async (onProgress) => {
        const zip = join(mkdtempSync(join(tmpdir(), 'hz-zip-')), MOONLIGHT.fileName)
        await downloadVerified(MOONLIGHT, zip, onProgress)
        return zip
      },
      extract: async (zip, into) => {
        await runPowerShell(
          `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
          120_000
        )
      }
    })
    expect(exe.endsWith('Moonlight.exe')).toBe(true)
    expect(existsSync(exe)).toBe(true)
  })
})
