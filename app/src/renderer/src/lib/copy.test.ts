import { describe, expect, it } from 'vitest'
import { copyFor, PREP_STEPS, safeName, stepEnd, stepLabel, stepStart } from './copy'

describe('safeName', () => {
  it('mantém nomes normais', () => {
    expect(safeName('Notebook da Sala')).toBe('Notebook da Sala')
  })

  it('HTML vira texto, sem ser interpretado nem apagado', () => {
    expect(safeName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('remove caracteres de controle e de direção invertida', () => {
    expect(safeName('No\u0000te\u0007')).toBe('Note')
    expect(safeName('Note\u202Ebook')).toBe('Notebook')
    expect(safeName('A\u200Bb')).toBe('Ab')
  })

  it('limita a 40 caracteres', () => {
    expect(safeName('a'.repeat(100))).toHaveLength(40)
  })

  it('vazio ou só espaços vira um nome genérico', () => {
    expect(safeName('')).toBe('Outro computador')
    expect(safeName('   ')).toBe('Outro computador')
    expect(safeName('\u0000\u202E')).toBe('Outro computador')
  })
})

describe('copyFor', () => {
  it('instalar', () => {
    const copy = copyFor({ screen: 'install' })
    expect(copy.title).toBe('Estenda sua tela,\nsem fio.')
    expect(copy.subtitle).toBe('Sem configurar nada.')
  })

  it('pronto aguarda conexão', () => {
    const copy = copyFor({ screen: 'ready', mode: 'send' })
    expect(copy.title).toBe('Pronto.')
    expect(copy.pill).toEqual({ tone: 'wait', text: 'Aguardando conexão' })
  })

  it('permitir usa o nome seguro do dispositivo', () => {
    const copy = copyFor({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })
    expect(copy.title).toBe('Permitir o Notebook?')
    const hostile = copyFor({
      screen: 'approve',
      mode: 'send',
      device: '\u202E',
      pairingId: 'p1',
      pin: null
    })
    expect(hostile.title).toBe('Permitir o Outro computador?')
  })

  it('conectado mostra o selo verde com o nome', () => {
    const copy = copyFor({ screen: 'connected', mode: 'send', device: 'Notebook' })
    expect(copy.title).toBe('Tela estendida.')
    expect(copy.pill).toEqual({ tone: 'ok', text: 'Notebook conectado' })
  })

  it('recebendo mostra o computador de origem', () => {
    const copy = copyFor({
      screen: 'receiving',
      mode: 'receive',
      host: '192.168.1.3',
      name: 'Desktop'
    })
    expect(copy.title).toBe('Recebendo a tela.')
    expect(copy.pill).toEqual({ tone: 'ok', text: 'Desktop' })
  })

  it('erro mostra a mensagem e o detalhe', () => {
    const copy = copyFor({
      screen: 'error',
      mode: 'send',
      error: {
        message: 'Não consegui criar o monitor virtual.',
        detail: 'A permissão foi recusada.'
      }
    })
    expect(copy.title).toBe('Não consegui criar o monitor virtual.')
    expect(copy.subtitle).toBe('A permissão foi recusada.')
  })

  it('demais telas', () => {
    expect(copyFor({ screen: 'choose' }).title).toBe('Este computador vai…')
    expect(copyFor({ screen: 'preparing', mode: 'send', step: 'engine' }).title).toBe('Preparando.')
    expect(copyFor({ screen: 'discover', mode: 'receive' }).title).toBe('Na sua rede')
  })
})

describe('stepLabel e progress', () => {
  it('uma frase por etapa, na ordem do fluxo', () => {
    expect(PREP_STEPS.map(stepLabel)).toEqual([
      'Preparando o motor',
      'Procurando o monitor virtual',
      'Testando a placa de vídeo'
    ])
  })

  it('cada etapa começa onde a anterior termina', () => {
    expect(stepStart('engine')).toBe(0)
    expect(stepEnd('engine')).toBe(stepStart('display'))
    expect(stepEnd('display')).toBe(stepStart('encoder'))
    expect(stepEnd('encoder')).toBe(1)
  })
})
