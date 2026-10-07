import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from '../windows/download'
import { sunshineDebFor } from './versions'

/** Só no Linux. */
describe.runIf(process.platform === 'linux')('Linux de verdade', () => {
  it('o pacote do Sunshine para este Ubuntu existe, bate com o hash e traz o binário que o instalador assume', async () => {
    const osRelease = readFileSync('/etc/os-release', 'utf8')
    console.log(osRelease.split('\n').slice(0, 4).join(' | '))
    const deb = sunshineDebFor(osRelease, process.arch)
    const file = join(mkdtempSync(join(tmpdir(), 'hz-linux-')), deb.fileName)
    await downloadVerified(deb, file)
    const contents = execFileSync('dpkg-deb', ['--contents', file]).toString()
    expect(contents).toMatch(/\.\/usr\/bin\/sunshine\b/)
    expect(contents).toMatch(/sunshine\.service/)
  })
})
