import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { downloadVerified } from '../windows/download'
import { sunshinePackageFor } from './versions'

/** Só no Linux. */
describe.runIf(process.platform === 'linux')('Linux de verdade', () => {
  it('o pacote do Sunshine para este Ubuntu existe, bate com o hash e traz o binário e o serviço que o instalador assume', async () => {
    const osRelease = readFileSync('/etc/os-release', 'utf8')
    console.log(osRelease.split('\n').slice(0, 4).join(' | '))
    const deb = sunshinePackageFor(osRelease, process.arch)
    // O conteúdo só é inspecionável com dpkg-deb; os outros formatos têm o hash conferido no download.
    if (deb.kind !== 'deb') return
    const file = join(mkdtempSync(join(tmpdir(), 'hz-linux-')), deb.fileName)
    await downloadVerified(deb, file)

    const contents = execFileSync('dpkg-deb', ['--contents', file]).toString()
    expect(contents).toMatch(/\.\/usr\/bin\/sunshine\b/)

    // O instalador roda "systemctl --user enable sunshine": o nome tem de existir (como arquivo ou como apelido).
    const unitPath = /\.(\/usr\/lib\/systemd\/user\/[^\s]+\.service)/.exec(contents)?.[1]
    expect(unitPath, 'o pacote traz uma unidade de serviço de usuário').toBeTruthy()
    const unit = execFileSync('sh', [
      '-c',
      `dpkg-deb --fsys-tarfile '${file}' | tar -xO '.${unitPath}'`
    ]).toString()
    console.log(`unidade ${unitPath}:\n${unit}`)
    expect(unitPath?.endsWith('/sunshine.service') || /^Alias=sunshine\.service$/m.test(unit)).toBe(
      true
    )
  })
})
