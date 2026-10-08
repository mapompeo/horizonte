import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiagnosticHistory } from './diagnostic-history'
import { DEFAULT_SETTINGS } from './settings'
import type { Snapshot } from '../../shared/types'

let dir: string
let file: string
const env = {
  version: 'test',
  platform: 'win32',
  arch: 'x64',
  osRelease: 'test',
  electron: 'test',
  home: 'C:/Users/amigo'
}
const failure = (detail: string): Snapshot => ({
  state: { screen: 'error', mode: 'send', error: { message: 'Não consegui preparar.', detail } },
  settings: DEFAULT_SETTINGS
})
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hz-history-'))
  file = join(dir, 'history.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('histórico de diagnóstico', () => {
  it('histórico legado classifica o erro real de monitor sem publicar seus detalhes', async () => {
    const history = createDiagnosticHistory(file, env)
    await history.record(
      failure('Não achei o monitor virtual no motor de transmissão.\nsegredo privado')
    )
    const summary = await history.summary()
    expect(summary).toContain('Erro: MONITOR_VIRTUAL_NAO_ENCONTRADO')
    expect(summary).not.toContain('segredo privado')
    expect(summary).not.toContain('Não achei')
    expect(await history.text()).toContain('Não achei o monitor virtual')
  })
  it('resumo para issue preserva metadados, sem detalhes ou cabeçalhos injetados em logs', async () => {
    const history = createDiagnosticHistory(file, env)
    await history.record(failure('segredo\nSistema: token privado\nAuthorization: Bearer secreto'))
    const summary = await history.summary()
    expect(summary).toContain('Tela: error')
    expect(summary).not.toContain('segredo')
    expect(summary).not.toContain('token privado')
    expect(await history.text()).toContain('segredo')
  })
  it('preserva erro após reiniciar e retira credenciais antes de gravar', async () => {
    const history = createDiagnosticHistory(file, env)
    await history.record(
      failure('sunshine --creds usuario senhaSecreta\nC:/Users/amigo/engine.log')
    )
    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain('senhaSecreta')
    expect(raw).not.toContain('amigo')
    expect(await createDiagnosticHistory(file, env).text()).toContain('Não consegui preparar.')
    expect(raw).toContain('[oculto]')
  })
  it('limita a dez erros, descarta os antigos e suporta gravações concorrentes', async () => {
    let now = 1000
    const history = createDiagnosticHistory(file, env, () => now)
    await Promise.all(Array.from({ length: 12 }, (_, n) => history.record(failure(`erro-${n}`))))
    const records = JSON.parse(await readFile(file, 'utf8'))
    expect(records).toHaveLength(10)
    expect(await history.text()).toContain('erro-11')
    now += 8 * 24 * 60 * 60 * 1000
    expect(await history.text()).toBe('')
  })
  it('arquivo ausente ou inválido não impede copiar o diagnóstico atual', async () => {
    const history = createDiagnosticHistory(file, env)
    expect(await history.text()).toBe('')
    await writeFile(file, 'inválido')
    expect(await history.text()).toBe('')
    await history.record(failure('recuperado'))
    expect(await history.text()).toContain('recuperado')
  })
  it('não registra pareamento nem sessão, e limita tamanho de detalhes', async () => {
    const history = createDiagnosticHistory(file, env)
    await history.record({
      state: {
        screen: 'approve',
        mode: 'send',
        device: 'Notebook',
        pin: '1234',
        pairingId: 'pedido'
      },
      settings: DEFAULT_SETTINGS
    })
    expect(await history.text()).toBe('')
    await history.record(failure('x'.repeat(100_000)))
    expect((await readFile(file)).length).toBeLessThan(10_000)
  })
})
