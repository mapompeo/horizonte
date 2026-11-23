import { describe, expect, it } from 'vitest'
import { placementScript } from './placement'

describe('placementScript', () => {
  it('procura o monitor virtual pelo código do VDD e grava só a posição dele', () => {
    const script = placementScript('left')
    expect(script).toContain("-match 'MTT1337'")
    expect(script).toContain('$dm.dmFields = 0x20')
    expect(script).toContain("switch ('left')")
  })

  it('não troca nulo por texto vazio ao listar as telas (o PowerShell faria isso com $null)', () => {
    expect(placementScript('right')).toContain('EnumDisplayDevices([NullString]::Value, $i')
  })
})
