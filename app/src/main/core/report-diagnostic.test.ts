import { describe, expect, it } from 'vitest'
import { buildReportDiagnostic, createDiagnosticReporter, reportSummary } from './report-diagnostic'
import { DEFAULT_SETTINGS } from './settings'
import { diagnosticErrorCode } from './diagnostic'

describe('diagnóstico revisado', () => {
  it.each([
    ['Não achei o monitor virtual no Sunshine.', 'MONITOR_VIRTUAL_NAO_ENCONTRADO'],
    [
      'O motor de transmissão não respondeu. Confira se ele está instalado e aberto.',
      'SUNSHINE_INDISPONIVEL'
    ],
    ['O pareamento não foi concluído. Aprove o pedido no outro dispositivo.', 'MOONLIGHT_FALHOU'],
    ['O pacote do driver veio incompleto.', 'DRIVER_INSTALACAO_FALHOU']
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
            message: 'Não consegui preparar.',
            detail:
              'Não achei o monitor virtual no motor de transmissão.\nAuthorization: Bearer segredo'
          }
        }
      }
    )
    expect(text).toContain('Erro: MONITOR_VIRTUAL_NAO_ENCONTRADO')
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
            message: 'token secreto\nErro: MOONLIGHT_FALHOU MALICIOSO',
            detail: 'cookies privados'
          }
        }
      }
    )
    expect(text).toContain('Erro: ERRO_NAO_CLASSIFICADO')
    expect(text).not.toContain('secreto')
    expect(text).not.toContain('MALICIOSO')
  })
  it('reportSummary só aceita linha inteira de código whitelist', () => {
    expect(
      reportSummary(
        'Erro: MONITOR_VIRTUAL_NAO_ENCONTRADO\nErro: SUNSHINE_INDISPONIVEL\nErro: MOONLIGHT_FALHOU\nErro: DRIVER_INSTALACAO_FALHOU\nErro: ERRO_NAO_CLASSIFICADO\nErro: MOONLIGHT_FALHOU segredo\nErro: INVENTADO\nErro: token privado'
      )
    ).toBe(
      'Erro: MONITOR_VIRTUAL_NAO_ENCONTRADO\nErro: SUNSHINE_INDISPONIVEL\nErro: MOONLIGHT_FALHOU\nErro: DRIVER_INSTALACAO_FALHOU\nErro: ERRO_NAO_CLASSIFICADO'
    )
  })
  it('limite considera a URL codificada inteira: 6000 abre preenchida, 6001 usa cópia', async () => {
    const base = new URL('https://github.com/mapompeo/horizonte/issues/new')
    base.searchParams.set('title', 'Diagnóstico do Horizonte')
    base.searchParams.set('body', 'Horizonte ')
    for (const size of [6000, 6001]) {
      const opened: string[] = [],
        copied: string[] = []
      const text = `Horizonte ${'x'.repeat(size - base.href.length)}`
      const reporter = createDiagnosticReporter({
        text: async () => text,
        open: async (url) => {
          opened.push(url)
        },
        copy: (value) => {
          copied.push(value)
        }
      })
      expect(await reporter.report(await reporter.prepare(false))).toBe(
        size === 6000 ? 'opened' : 'copied'
      )
      expect(copied).toEqual(size === 6000 ? [] : [text])
      if (size === 6000) expect(opened[0]).toHaveLength(6000)
    }
  })
  it('rejeita opção de histórico inválida e invalida revisão anterior se a consulta falhar', async () => {
    let fail = false
    const reporter = createDiagnosticReporter({
      text: async () => {
        if (fail) throw new Error('leitura')
        return 'Horizonte 1'
      },
      open: async () => undefined,
      copy: () => undefined
    })
    const draft = await reporter.prepare(false)
    fail = true
    await expect(reporter.prepare(true)).rejects.toThrow('leitura')
    await expect(reporter.report(draft)).rejects.toThrow('Revise')
    await expect(reporter.prepare('yes')).rejects.toThrow('inválida')
  })
  it('não inclui mensagens, detalhes ou linhas arbitrárias do histórico', () => {
    expect(
      reportSummary('Horizonte 1\nTela: error\nErro: token=segredo\nDetalhe: log\nsenha secreta')
    ).toBe('Horizonte 1\nTela: error')
  })
  it('abre somente o destino fixo com Unicode e caracteres especiais preservados', async () => {
    const urls: string[] = []
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1\nTela: error\nSistema: ação & # +',
      open: async (url) => {
        urls.push(url)
      },
      copy: () => undefined
    })
    const draft = await reporter.prepare(false)
    expect(urls).toHaveLength(0)
    expect(await reporter.report(draft)).toBe('opened')
    const url = new URL(urls[0])
    expect(url.origin + url.pathname).toBe('https://github.com/mapompeo/horizonte/issues/new')
    expect(url.searchParams.get('body')).toBe(draft)
  })
  it('rejeita texto não revisado ou adulterado sem abrir navegador', async () => {
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1',
      open: async () => {
        throw new Error('não deveria abrir')
      },
      copy: () => undefined
    })
    await expect(reporter.report('https://evil.example')).rejects.toThrow()
    await reporter.prepare(false)
    for (const value of [null, {}, '', 'Horizonte 1\nAuthorization: Bearer segredo'])
      await expect(reporter.report(value)).rejects.toThrow()
  })
  it('URL longa copia apenas o texto revisado e abre formulário vazio, sem truncamento', async () => {
    const urls: string[] = [],
      copies: string[] = []
    const reporter = createDiagnosticReporter({
      text: async () => `Horizonte ${'á'.repeat(1500)}`,
      open: async (url) => {
        urls.push(url)
      },
      copy: (text) => {
        copies.push(text)
      }
    })
    const draft = await reporter.prepare(true)
    expect(await reporter.report(draft)).toBe('copied')
    expect(copies).toEqual([draft])
    expect(new URL(urls[0]).searchParams.has('body')).toBe(false)
  })
  it('propaga rejeições de consulta, clipboard e navegador', async () => {
    const reporter = createDiagnosticReporter({
      text: async () => {
        throw new Error('leitura')
      },
      open: async () => undefined,
      copy: () => undefined
    })
    await expect(reporter.prepare(false)).rejects.toThrow('leitura')
    const failing = createDiagnosticReporter({
      text: async () => 'Horizonte 1',
      open: async () => {
        throw new Error('navegador')
      },
      copy: () => undefined
    })
    await expect(failing.report(await failing.prepare(false))).rejects.toThrow('navegador')
    const clipboard = createDiagnosticReporter({
      text: async () => `Horizonte ${'á'.repeat(1500)}`,
      open: async () => {
        throw new Error('não deveria abrir')
      },
      copy: () => {
        throw new Error('clipboard')
      }
    })
    await expect(clipboard.report(await clipboard.prepare(false))).rejects.toThrow('clipboard')
  })
})
