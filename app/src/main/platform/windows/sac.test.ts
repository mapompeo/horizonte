import { describe, expect, it } from 'vitest'
import { describeSmartAppControl, readSmartAppControl } from './smart-app-control'
import { runPowerShell } from './probes'

describe('readSmartAppControl', () => {
  it.each([
    ['0', 'off'],
    ['1', 'on'],
    ['2', 'evaluation'],
    ['', 'unknown'],
    ['lixo', 'unknown']
  ] as const)('valor %j vira %s', async (raw, state) => {
    expect(await readSmartAppControl(async () => raw)).toBe(state)
  })

  it('falha ao ler vira unknown', async () => {
    expect(
      await readSmartAppControl(async () => {
        throw new Error('x')
      })
    ).toBe('unknown')
  })

  it.runIf(process.platform === 'win32')('lê o registro de verdade', async () => {
    expect(['off', 'on', 'evaluation', 'unknown']).toContain(
      await readSmartAppControl(runPowerShell)
    )
  })
})

describe('describeSmartAppControl', () => {
  it('ligado e avaliação explicam em uma frase, sem sugerir contornar', () => {
    for (const state of ['on', 'evaluation'] as const) {
      const message = describeSmartAppControl(state)
      expect(message).toMatch(/Controle Inteligente de Aplicativos/)
      expect(message).not.toMatch(/desativ|desligue|burl/i)
      expect(message?.split('. ').length).toBeLessThanOrEqual(2)
    }
  })

  it('desligado ou desconhecido não alarma', () => {
    expect(describeSmartAppControl('off')).toBeNull()
    expect(describeSmartAppControl('unknown')).toBeNull()
  })
})
