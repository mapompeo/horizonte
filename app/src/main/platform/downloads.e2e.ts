import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DownloadError, downloadVerified } from './windows/download'

/** Roda nos três sistemas: o baixador verificado é o que protege a instalação de tudo. */
describe('downloadVerified de verdade', () => {
  const url = 'https://raw.githubusercontent.com/mapompeo/horizonte/main/README.md'

  it('hash errado: recusa e não deixa arquivo nenhum para trás', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hz-dl-'))
    const error = await downloadVerified(
      { url, sha256: '0'.repeat(64) },
      join(dir, 'README.md')
    ).then(
      () => null,
      (cause: unknown) => cause
    )
    expect(error).toBeInstanceOf(DownloadError)
    expect((error as DownloadError).kind).toBe('hash')
    expect(await readdir(dir)).toEqual([])
  })

  it('endereço que não existe: erro de rede, sem arquivo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hz-dl-'))
    const error = await downloadVerified(
      { url: `${url}.nao-existe`, sha256: '0'.repeat(64) },
      join(dir, 'x')
    ).then(
      () => null,
      (cause: unknown) => cause
    )
    expect(error).toBeInstanceOf(DownloadError)
    expect(await readdir(dir)).toEqual([])
  })
})
