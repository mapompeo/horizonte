import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SunshineApi, SunshineApiError } from './api'
import { startFakeSunshine, type FakeSunshine } from './testing/fake-sunshine'

const PASSWORD = 'segredo-123'
let fake: FakeSunshine
let api: SunshineApi

beforeEach(async () => {
  fake = await startFakeSunshine({ username: 'horizonte', password: PASSWORD })
  api = new SunshineApi({
    port: fake.basePort,
    username: 'horizonte',
    password: PASSWORD,
    timeoutMs: 300
  })
})

afterEach(async () => {
  await fake.close()
})

async function failureOf(promise: Promise<unknown>): Promise<SunshineApiError> {
  try {
    await promise
  } catch (cause) {
    if (cause instanceof SunshineApiError) return cause
    throw cause
  }
  throw new Error('esperava uma falha')
}

describe('pareamentos', () => {
  it('lista os pedidos pendentes', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.listPairings()).toEqual([
      { id: 'p1', name: 'Notebook', address: '192.168.1.2' }
    ])
  })

  it('ignora itens malformados da lista', async () => {
    fake.rawPinResponse = {
      pairings: [{ id: 'a' }, 5, null, { name: 'sem id' }, { id: 7, name: 'n' }]
    }
    expect(await api.listPairings()).toEqual([
      { id: 'a', name: '', address: '' },
      { id: '7', name: 'n', address: '' }
    ])
  })

  it('uma resposta sem a lista é inválida', async () => {
    fake.rawPinResponse = { outra: 'coisa' }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('manda o PIN no formato do motor de transmissão e devolve verdadeiro quando confere', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.submitPin({ pairingId: 'p1', pin: '4821', name: 'Notebook' })).toBe(true)
    expect(fake.submitted).toEqual([{ pairing_id: 'p1', pin: '4821', name: 'Notebook' }])
  })

  it('devolve falso quando o PIN não confere', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    expect(await api.submitPin({ pairingId: 'p1', pin: '0000', name: 'Notebook' })).toBe(false)
  })

  it('cancela um pedido', async () => {
    fake.pairings.push({ id: 'p1', name: 'Notebook', address: '192.168.1.2' })
    await api.cancelPairing('p1')
    expect(fake.cancelled).toEqual(['p1'])
    expect(await api.listPairings()).toEqual([])
  })
})

describe('configuração', () => {
  it('lê a configuração', async () => {
    fake.config = { output_name: 'abc', sunshine_name: 'Desktop' }
    expect(await api.getConfig()).toEqual({ output_name: 'abc', sunshine_name: 'Desktop' })
  })

  it('metadados que o motor de transmissão anexa à leitura não viram configuração', async () => {
    fake.config = { output_name: 'abc', platform: 'windows', status: true, version: '2026.914' }
    expect(await api.getConfig()).toEqual({ output_name: 'abc' })
    await api.saveConfig({ amd_usage: 'transcoding' })
    expect(fake.config).toEqual({ output_name: 'abc', amd_usage: 'transcoding' })
  })

  it('gravar um trecho nunca apaga o resto da configuração', async () => {
    fake.config = { output_name: 'abc', sunshine_name: 'Desktop', amd_rc: 'cbr' }
    await api.saveConfig({ amd_usage: 'transcoding' })
    expect(fake.config).toEqual({
      output_name: 'abc',
      sunshine_name: 'Desktop',
      amd_rc: 'cbr',
      amd_usage: 'transcoding'
    })
  })

  it('o trecho novo vence o valor antigo', async () => {
    fake.config = { sunshine_name: 'Desktop' }
    await api.saveConfig({ sunshine_name: 'Sala' })
    expect(fake.config).toEqual({ sunshine_name: 'Sala' })
  })

  it('valores que não são texto na configuração voltam como vieram', async () => {
    fake.config = { lista: ['a', 'b'], ligado: true }
    await api.saveConfig({ x: '1' })
    expect(fake.config).toEqual({ lista: ['a', 'b'], ligado: true, x: '1' })
  })
})

describe('outras chamadas', () => {
  it('fecha o aplicativo em execução', async () => {
    await api.closeApp()
    expect(fake.closedApps).toBe(1)
  })

  it('reiniciar tolera a conexão caindo no meio', async () => {
    fake.failNext = { destroy: true }
    await expect(api.restart()).resolves.toBeUndefined()
  })

  it('reiniciar tolera o tempo esgotado', async () => {
    fake.delayMs = 1000
    await expect(api.restart()).resolves.toBeUndefined()
  })
})

describe('falhas', () => {
  it('senha errada vira "unauthorized" e a senha nunca aparece na mensagem', async () => {
    const wrong = new SunshineApi({
      port: fake.basePort,
      username: 'horizonte',
      password: 'errada-999',
      timeoutMs: 300
    })
    const error = await failureOf(wrong.listPairings())
    expect(error.kind).toBe('unauthorized')
    expect(error.status).toBe(401)
    expect(error.message).not.toContain('errada-999')
    expect(error.message).not.toContain(PASSWORD)
    expect(String(error.stack)).not.toContain('errada-999')
  })

  it('porta fechada vira "unreachable"', async () => {
    await fake.close()
    expect((await failureOf(api.listPairings())).kind).toBe('unreachable')
  })

  it('conexão derrubada no meio vira "unreachable"', async () => {
    fake.failNext = { destroy: true }
    expect((await failureOf(api.listPairings())).kind).toBe('unreachable')
  })

  it('servidor lento vira "timeout"', async () => {
    fake.delayMs = 1000
    expect((await failureOf(api.listPairings())).kind).toBe('timeout')
  })

  it('erro 500 vira "server" com o status', async () => {
    fake.failNext = { status: 500 }
    const error = await failureOf(api.listPairings())
    expect(error.kind).toBe('server')
    expect(error.status).toBe(500)
  })

  it('resposta que não é JSON vira "invalid-response"', async () => {
    fake.failNext = { status: 200, raw: '<html>oi</html>' }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('resposta gigante vira "invalid-response" sem estourar a memória', async () => {
    fake.failNext = { huge: true }
    expect((await failureOf(api.listPairings())).kind).toBe('invalid-response')
  })

  it('PIN com resposta sem status é tratado como não confere', async () => {
    fake.failNext = { status: 200, raw: '{}' }
    expect(await api.submitPin({ pairingId: 'p1', pin: '4821', name: 'x' })).toBe(false)
  })
})

describe('segurança do destino', () => {
  it.each(['192.168.1.9', 'exemplo.com', '0.0.0.0', ''])('recusa o endereço %s', (host) => {
    expect(() => new SunshineApi({ port: 47989, username: 'u', password: 'p', host })).toThrow()
  })

  it.each(['127.0.0.1', 'localhost', '::1'])('aceita o endereço de loopback %s', (host) => {
    expect(() => new SunshineApi({ port: 47989, username: 'u', password: 'p', host })).not.toThrow()
  })
})
