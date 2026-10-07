import { describe, expect, it } from 'vitest'
import { generatePassword, waitForApi, toCipher } from './wire'

describe('toCipher', () => {
  it('recusa o backend basic_text do Linux mesmo quando o Electron diz que criptografia está disponível', () => {
    const cipher = toCipher({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: () => Buffer.alloc(0),
      decryptString: () => ''
    })
    expect(cipher.isAvailable()).toBe(false)
  })
})

describe('generatePassword', () => {
  it('é longa, só com letras e números (segura para a linha de comando) e diferente a cada vez', () => {
    const a = generatePassword()
    const b = generatePassword()
    expect(a).toMatch(/^[A-Za-z0-9]{24,}$/)
    expect(a).not.toBe(b)
  })
})

describe('waitForApi', () => {
  it('tenta de novo até a API responder', async () => {
    let calls = 0
    await waitForApi(
      async () => {
        calls += 1
        if (calls < 3) throw new Error('ainda subindo')
      },
      async () => undefined,
      10
    )
    expect(calls).toBe(3)
  })

  it('desiste com mensagem clara depois do limite de tentativas', async () => {
    let calls = 0
    await expect(
      waitForApi(
        async () => {
          calls += 1
          throw new Error('nada')
        },
        async () => undefined,
        4
      )
    ).rejects.toThrow(/motor de transmissão não respondeu/)
    expect(calls).toBe(4)
  })
})
