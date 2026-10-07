import { describe, expect, it } from 'vitest'
import type { AppState, Snapshot } from '../../shared/types'
import { DEFAULT_SETTINGS } from './settings'
import { buildDiagnostic, type DiagnosticEnv } from './diagnostic'

const env: DiagnosticEnv = {
  version: '0.1.0-beta.6',
  platform: 'darwin',
  arch: 'arm64',
  osRelease: '24.1.0',
  electron: '44.5.1',
  home: '/Users/amigo'
}
const snapshot = (state: AppState): Snapshot => ({
  state,
  settings: { ...DEFAULT_SETTINGS, mode: 'send' }
})

describe('buildDiagnostic', () => {
  it.each([
    [
      'sh',
      "sunshine --creds 'usuario privado' 'senha privada'",
      ['usuario privado', 'senha privada']
    ],
    [
      'sh com apóstrofo',
      String.raw`sunshine --creds 'ana' 'segredo'\''com-aspas'`,
      ['ana', 'segredo', 'com-aspas']
    ],
    [
      'PowerShell',
      "& 'C:\\Program Files\\Sunshine\\sunshine.exe' --creds 'ana''silva' 'senha''privada'",
      ['ana', 'silva', 'senha', 'privada']
    ],
    [
      'Windows com aspas duplas',
      String.raw`sunshine.exe --creds "usuario privado" "segredo\"com-aspas"`,
      ['usuario privado', 'segredo', 'com-aspas']
    ],
    [
      'sem aspas',
      'sunshine --creds usuarioSecreto senhaSecreta',
      ['usuarioSecreto', 'senhaSecreta']
    ],
    [
      'sh com escape',
      String.raw`sunshine --creds usuario\ privado senha\ privada`,
      ['usuario', 'senha']
    ],
    [
      'URL',
      'https://usuarioSecreto:senha%40Secreta@localhost:47990/api/config',
      ['usuarioSecreto', 'senha%40Secreta']
    ],
    ['Basic', 'Authorization: Basic dXN1YXJpbzpzZW5oYQ==', ['dXN1YXJpbzpzZW5oYQ==']],
    ['Bearer JSON', '"Authorization": "Bearer token.Secreto-123"', ['token.Secreto-123']],
    ['Bearer minúsculo', 'authorization: bearer segredoToken', ['segredoToken']]
  ])('remove credenciais de mensagem e detalhe: %s', (_name, sensitive, secrets) => {
    const error = `Command failed: ${sensitive}\nECONNREFUSED porta 47990; exit code 1`
    const text = buildDiagnostic(
      env,
      snapshot({
        screen: 'error',
        mode: 'send',
        error: { message: error, detail: error }
      })
    )
    for (const secret of secrets) expect(text).not.toContain(secret)
    expect(text).toContain('Command failed:')
    expect(text.match(/ECONNREFUSED porta 47990; exit code 1/g)).toHaveLength(2)
    expect(text).toContain('[oculto]')
    if (sensitive.includes('localhost')) expect(text).toContain('localhost:47990/api/config')
  })

  it('preserva texto comum, URLs sem credenciais e opções não sensíveis', () => {
    const detail =
      'sunshine --config /tmp/sunshine.conf; https://localhost:47990/api/config; Authorization recusada: HTTP 401'
    const text = buildDiagnostic(
      env,
      snapshot({
        screen: 'error',
        mode: 'send',
        error: { message: 'Falha de conexão', detail }
      })
    )
    expect(text).toContain(detail)
  })

  it('traz versão, sistema, tela atual e ajustes: o que quem recebe precisa para entender', () => {
    const text = buildDiagnostic(env, snapshot({ screen: 'ready', mode: 'send' }))
    expect(text).toContain('Horizonte 0.1.0-beta.6')
    expect(text).toContain('darwin arm64 (24.1.0)')
    expect(text).toContain('Electron 44.5.1')
    expect(text).toContain('Tela: ready (modo send)')
    expect(text).toContain('Qualidade: 30 Mbps, 1080p, 60 fps, h264, codificação auto')
  })

  it('numa tela de erro, mostra a mensagem e o detalhe', () => {
    const text = buildDiagnostic(
      env,
      snapshot({
        screen: 'error',
        mode: 'receive',
        error: { message: 'Falhou', detail: 'porta 47990 fechada' }
      })
    )
    expect(text).toContain('Erro: Falhou')
    expect(text).toContain('Detalhe: porta 47990 fechada')
  })

  it('nunca vaza o PIN, o número do pedido, o nome de outro aparelho nem o endereço de rede', () => {
    const states: AppState[] = [
      {
        screen: 'approve',
        mode: 'send',
        device: 'Notebook da Ana',
        pairingId: 'pair-9f3',
        pin: '4821'
      },
      { screen: 'connected', mode: 'send', device: 'Notebook da Ana' },
      { screen: 'receiving', mode: 'receive', host: '192.168.1.5', name: 'Desktop do João' }
    ]
    for (const state of states) {
      const text = buildDiagnostic(env, snapshot(state))
      for (const secret of ['4821', 'pair-9f3', 'Ana', '192.168.1.5', 'João']) {
        expect(text).not.toContain(secret)
      }
      expect(text).toContain(`Tela: ${state.screen}`)
    }
  })

  it('esconde o nome do usuário do computador nos caminhos do erro', () => {
    const text = buildDiagnostic(
      env,
      snapshot({
        screen: 'error',
        mode: 'send',
        error: {
          message: 'Falhou',
          detail: 'ENOENT /Users/amigo/Library/Application Support/horizonte/engine.json'
        }
      })
    )
    expect(text).not.toContain('amigo')
    expect(text).toContain('~/Library/Application Support/horizonte/engine.json')
  })

  it('home no Windows, com barras invertidas e em qualquer caixa', () => {
    const text = buildDiagnostic(
      { ...env, platform: 'win32', home: 'C:\\Users\\mathe' },
      snapshot({
        screen: 'error',
        mode: 'send',
        error: {
          message: 'x',
          detail: 'falha em c:\\users\\MATHE\\AppData\\horizonte e C:/Users/mathe/dev'
        }
      })
    )
    expect(text.toLowerCase()).not.toContain('mathe')
  })

  it('home vazio ou curto demais não apaga o texto todo', () => {
    for (const home of ['', '/', 'C:']) {
      const text = buildDiagnostic(
        { ...env, home },
        snapshot({
          screen: 'error',
          mode: 'send',
          error: { message: 'Falhou', detail: 'no disco C:' }
        })
      )
      expect(text).toContain('Erro: Falhou')
      expect(text).toContain('Detalhe: no disco C:')
    }
  })
})
