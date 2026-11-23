import { describe, expect, it } from 'vitest'
import { VIRTUAL_DISPLAY_DRIVER } from './versions'

describe('versão fixa: driver de monitor virtual', () => {
  it('baixa por https e pelo nome da versão fixa', () => {
    expect(VIRTUAL_DISPLAY_DRIVER.url.startsWith('https://github.com/')).toBe(true)
    expect(VIRTUAL_DISPLAY_DRIVER.url).toContain(VIRTUAL_DISPLAY_DRIVER.version)
    expect(VIRTUAL_DISPLAY_DRIVER.url.endsWith(VIRTUAL_DISPLAY_DRIVER.fileName)).toBe(true)
  })

  it('tem um SHA-256 de 64 dígitos hexadecimais', () => {
    expect(VIRTUAL_DISPLAY_DRIVER.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
