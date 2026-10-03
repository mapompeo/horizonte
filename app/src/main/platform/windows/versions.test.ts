import { describe, expect, it } from 'vitest'
import { SUNSHINE, VIRTUAL_DISPLAY_DRIVER } from './versions'

describe.each([
  ['Sunshine', SUNSHINE],
  ['driver de monitor virtual', VIRTUAL_DISPLAY_DRIVER]
])('versão fixa: %s', (_name, artifact) => {
  it('baixa por https e pelo nome da versão fixa', () => {
    expect(artifact.url.startsWith('https://github.com/')).toBe(true)
    expect(artifact.url).toContain(artifact.version)
    expect(artifact.url.endsWith(artifact.fileName)).toBe(true)
  })

  it('tem um SHA-256 de 64 dígitos hexadecimais', () => {
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
