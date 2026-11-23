import { expect, it } from 'vitest'
// @ts-expect-error módulo .mjs sem tipos: é só um script da CI
import { refreshLatest } from './refresh-latest-yml.mjs'

const YML = `version: 0.2.0-beta.74
files:
  - url: Horizonte-0.2.0-beta.74-setup.exe
    sha512: velho
    size: 100
path: Horizonte-0.2.0-beta.74-setup.exe
sha512: velho
releaseDate: '2026-11-18T17:12:06.000Z'
`

it('o hash e o tamanho do instalador assinado entram na lista e no topo', () => {
  const out = refreshLatest(YML, 'Horizonte-0.2.0-beta.74-setup.exe', { sha512: 'novo', size: 123 })
  expect(out).toBe(YML.replace(/velho/g, 'novo').replace('size: 100', 'size: 123'))
})

it('arquivo que o latest.yml não lista é erro, não silêncio', () => {
  expect(() => refreshLatest(YML, 'outro.exe', { sha512: 'x', size: 1 })).toThrow('não lista')
})
