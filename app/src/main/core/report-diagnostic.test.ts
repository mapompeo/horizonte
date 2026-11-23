import { describe, expect, it } from 'vitest'
import { createDiagnosticReporter } from './report-diagnostic'
import { diagnosticErrorCode } from './diagnostic'

describe('diagnóstico revisado', () => {
  it.each([
    ['Não achei o monitor virtual no motor de transmissão.', '201'],
    ['O pacote do driver veio incompleto.', '202']
  ])('classifica assinatura conhecida sem devolver texto livre: %s', (message, code) => {
    expect(diagnosticErrorCode(message)).toBe(code)
  })
  it('um clique manda o relatório para o endereço fixo e diz que foi enviado', async () => {
    const sent: string[] = []
    const saved: string[] = []
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1\nrelatório',
      post: async (text) => {
        sent.push(text)
        return true
      },
      save: async (text) => void saved.push(text)
    })
    expect(await reporter.send()).toBe('sent')
    expect(sent).toEqual(['Horizonte 1\nrelatório'])
    expect(saved).toEqual([])
  })
  it('sem conseguir mandar, salva o mesmo relatório num arquivo', async () => {
    const saved: string[] = []
    const reporter = createDiagnosticReporter({
      text: async () => 'Horizonte 1\nrelatório',
      post: async () => false,
      save: async (text) => void saved.push(text)
    })
    expect(await reporter.send()).toBe('saved')
    expect(saved).toEqual(['Horizonte 1\nrelatório'])
  })
})
