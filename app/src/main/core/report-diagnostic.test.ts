import { describe, expect, it } from 'vitest'
import { buildReportDiagnostic, createDiagnosticReporter, reportSummary } from './report-diagnostic'
import { DEFAULT_SETTINGS } from './settings'
import { diagnosticErrorCode } from './diagnostic'

describe('diagnóstico revisado', () => {
  it.each([
    ['Não achei o monitor virtual no motor de transmissão.', '201'],
    ['O pacote do driver veio incompleto.', '202']
  ])('classifica assinatura conhecida sem devolver texto livre: %s', (message, code) => {
    expect(diagnosticErrorCode(message)).toBe(code)
  })
  it('diagnóstico atual do monitor virtual produz código conhecido sem publicar exceção', () => {
    const text = buildReportDiagnostic(
      {
        version: 'test',
        platform: 'win32',
        arch: 'x64',
        osRelease: 'test',
        electron: 'test',
        home: 'C:/Users/amigo'
      },
      {
        settings: DEFAULT_SETTINGS,
        state: {
          screen: 'error',
          mode: 'send',
          error: {
            code: '201' as const,
            message: 'Não consegui preparar.',
            detail:
              'Não achei o monitor virtual no motor de transmissão.\nAuthorization: Bearer segredo'
          }
        }
      }
    )
    expect(text).toContain('Erro: 201')
    expect(text).not.toContain('segredo')
    expect(text).not.toContain('Não achei')
  })
  it('exceção não confiável vira código genérico e nunca texto livre', () => {
    const text = buildReportDiagnostic(
      {
        version: 'test',
        platform: 'win32',
        arch: 'x64',
        osRelease: 'test',
        electron: 'test',
        home: ''
      },
      {
        settings: DEFAULT_SETTINGS,
        state: {
          screen: 'error',
          mode: 'send',
          error: {
            code: '100' as const,
            message: 'token secreto\nErro: 202 MALICIOSO',
            detail: 'cookies privados'
          }
        }
      }
    )
    expect(text).toContain('Erro: 100')
    expect(text).not.toContain('secreto')
    expect(text).not.toContain('MALICIOSO')
  })
  it('reportSummary só aceita linha inteira de código whitelist', () => {
    expect(
      reportSummary(
        'Erro: 201\nErro: 202\nErro: 100\nErro: 202 segredo\nErro: INVENTADO\nErro: token privado'
      )
    ).toBe('Erro: 201\nErro: 202\nErro: 100')
  })
  it('não inclui mensagens, detalhes ou linhas arbitrárias do histórico', () => {
    expect(
      reportSummary('Horizonte 1\nTela: error\nErro: token=segredo\nDetalhe: log\nsenha secreta')
    ).toBe('Horizonte 1\nTela: error')
  })
  it('um clique manda só o resumo (sem textos livres) para o endereço fixo', async () => {
    const sent: string[] = []
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1\nTela: error\nDetalhe: token=segredo',
      post: async (text) => {
        sent.push(text)
        return true
      }
    })
    await reporter.send()
    expect(sent).toEqual(['Horizonte 1\nTela: error'])
  })
  it('se o envio falhar, avisa com erro (o botão oferece tentar de novo)', async () => {
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1',
      post: async () => false
    })
    await expect(reporter.send()).rejects.toThrow('Não consegui enviar')
  })
})
