import { describe, expect, it } from 'vitest'
import { approvalPin, reduce } from './machine'
import type { AppEvent, AppState } from '../../shared/types'

const preparing: AppState = { screen: 'preparing', mode: 'send', step: 'engine' }
const ready: AppState = { screen: 'ready', mode: 'send' }
const approve: AppState = {
  screen: 'approve',
  mode: 'send',
  device: 'Notebook',
  pairingId: 'p1',
  pin: null
}
const approveWithPin: AppState = { ...approve, pin: '4821' }
const connected: AppState = { screen: 'connected', mode: 'send', device: 'Notebook' }
const discover: AppState = { screen: 'discover', mode: 'receive' }
const receiving: AppState = {
  screen: 'receiving',
  mode: 'receive',
  host: '192.168.1.3',
  name: 'Desktop'
}
const failure = { message: 'Falhou', detail: 'detalhe' }

describe('reduce: caminho feliz', () => {
  const cases: [string, AppState, AppEvent, AppState][] = [
    [
      'Começar prepara tudo',
      { screen: 'install' },
      { type: 'INSTALL_DONE' },
      { screen: 'preparing', mode: 'send', step: 'engine', firstRun: true }
    ],
    ['escolher enviar', { screen: 'choose' }, { type: 'CHOOSE', mode: 'send' }, preparing],
    ['escolher mostrar', { screen: 'choose' }, { type: 'CHOOSE', mode: 'receive' }, discover],
    [
      'passo da preparação',
      preparing,
      { type: 'PREP_STEP', step: 'display' },
      { ...preparing, step: 'display' }
    ],
    ['preparação termina', preparing, { type: 'PREP_DONE' }, ready],
    [
      'pedido de pareamento',
      ready,
      { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1' },
      approve
    ],
    [
      'pedido de pareamento já com o PIN',
      ready,
      { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1', pin: '4821' },
      approveWithPin
    ],
    [
      'pedido com PIN inválido vira digitação manual',
      ready,
      { type: 'PAIR_REQUEST', device: 'Notebook', pairingId: 'p1', pin: 'zz' },
      approve
    ],
    ['aprovar digitando o PIN', approve, { type: 'APPROVE', pin: '4821' }, ready],
    ['aprovar com o PIN já conhecido', approveWithPin, { type: 'APPROVE' }, ready],
    ['recusar', approve, { type: 'DENY' }, ready],
    ['pedido cancelado pelo motor', approve, { type: 'PAIR_CANCELLED', pairingId: 'p1' }, ready],
    ['cliente conecta', ready, { type: 'CLIENT_CONNECTED', device: 'Notebook' }, connected],
    ['cliente desconecta', connected, { type: 'CLIENT_DISCONNECTED' }, ready],
    ['parar o envio', connected, { type: 'STOP' }, ready],
    [
      'conectar a um computador',
      discover,
      { type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' },
      receiving
    ],
    ['a transmissão acaba', receiving, { type: 'STREAM_ENDED' }, discover],
    ['sair', receiving, { type: 'STOP' }, discover]
  ]

  it.each(cases)('%s', (_name, from, event, to) => {
    expect(reduce(from, event)).toEqual(to)
  })
})

describe('reduce: troca de modo a um clique', () => {
  it('de enviar para mostrar a partir de qualquer tela do modo enviar', () => {
    for (const from of [preparing, ready, approve, connected]) {
      expect(reduce(from, { type: 'CHOOSE', mode: 'receive' })).toEqual(discover)
    }
  })

  it('de mostrar para enviar', () => {
    for (const from of [discover, receiving]) {
      expect(reduce(from, { type: 'CHOOSE', mode: 'send' })).toEqual(preparing)
    }
  })

  it('escolher o mesmo modo não reinicia nada', () => {
    expect(reduce(ready, { type: 'CHOOSE', mode: 'send' })).toBe(ready)
    expect(reduce(connected, { type: 'CHOOSE', mode: 'send' })).toBe(connected)
    expect(reduce(discover, { type: 'CHOOSE', mode: 'receive' })).toBe(discover)
  })

  it('sai de uma tela de erro ao escolher o outro modo', () => {
    const error: AppState = { screen: 'error', mode: 'send', error: failure }
    expect(reduce(error, { type: 'CHOOSE', mode: 'receive' })).toEqual(discover)
  })

  it('ignora a escolha de modo durante a instalação', () => {
    const install: AppState = { screen: 'install' }
    expect(reduce(install, { type: 'CHOOSE', mode: 'send' })).toBe(install)
  })
})

describe('reduce: erros', () => {
  it('qualquer estado vira erro com o modo atual', () => {
    expect(reduce(ready, { type: 'FAIL', error: failure })).toEqual({
      screen: 'error',
      mode: 'send',
      error: failure
    })
    expect(reduce(receiving, { type: 'FAIL', error: failure })).toEqual({
      screen: 'error',
      mode: 'receive',
      error: failure
    })
  })

  it('erro antes de escolher o modo assume enviar', () => {
    expect(reduce({ screen: 'install' }, { type: 'FAIL', error: failure })).toEqual({
      screen: 'error',
      mode: 'send',
      error: failure
    })
  })

  it('um novo erro substitui o anterior', () => {
    const first: AppState = { screen: 'error', mode: 'send', error: failure }
    const next = reduce(first, { type: 'FAIL', error: { message: 'Outro' } })
    expect(next).toEqual({ screen: 'error', mode: 'send', error: { message: 'Outro' } })
  })

  it('tentar de novo volta ao início do modo', () => {
    expect(reduce({ screen: 'error', mode: 'send', error: failure }, { type: 'RETRY' })).toEqual(
      preparing
    )
    expect(reduce({ screen: 'error', mode: 'receive', error: failure }, { type: 'RETRY' })).toEqual(
      discover
    )
  })
})

describe('reduce: eventos no estado errado são ignorados', () => {
  const cases: [string, AppState, AppEvent][] = [
    [
      'pedido de pareamento durante uma conexão',
      connected,
      { type: 'PAIR_REQUEST', device: 'Intruso', pairingId: 'x' }
    ],
    [
      'pedido de pareamento com outro já pendente',
      approve,
      { type: 'PAIR_REQUEST', device: 'Outro', pairingId: 'y' }
    ],
    ['aprovar sem PIN', approve, { type: 'APPROVE' }],
    ['aprovar com PIN curto', approve, { type: 'APPROVE', pin: '12' }],
    ['aprovar com PIN que não é número', approve, { type: 'APPROVE', pin: 'abcd' }],
    ['cancelamento de outro pedido', approve, { type: 'PAIR_CANCELLED', pairingId: 'outro' }],
    ['cancelamento sem pedido', ready, { type: 'PAIR_CANCELLED', pairingId: 'p1' }],
    [
      'cliente conecta com pedido pendente',
      approve,
      { type: 'CLIENT_CONNECTED', device: 'Notebook' }
    ],
    ['aprovar sem pedido', ready, { type: 'APPROVE' }],
    ['recusar sem pedido', ready, { type: 'DENY' }],
    ['fim da preparação já pronto', ready, { type: 'PREP_DONE' }],
    ['fim da preparação no modo mostrar', discover, { type: 'PREP_DONE' }],
    ['passo da preparação já pronto', ready, { type: 'PREP_STEP', step: 'display' }],
    ['aprovar durante a instalação', { screen: 'install' }, { type: 'APPROVE' }],
    ['passo antes de escolher', { screen: 'choose' }, { type: 'PREP_STEP', step: 'engine' }],
    ['conectar já recebendo', receiving, { type: 'CONNECT', host: '10.0.0.9', name: 'Outro' }],
    ['conectar no modo enviar', ready, { type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' }],
    [
      'preparação termina em erro',
      { screen: 'error', mode: 'send', error: failure },
      { type: 'PREP_DONE' }
    ],
    ['parar sem conexão', ready, { type: 'STOP' }],
    ['transmissão acaba no modo enviar', ready, { type: 'STREAM_ENDED' }],
    ['tentar de novo sem erro', ready, { type: 'RETRY' }]
  ]

  it.each(cases)('%s', (_name, state, event) => {
    expect(reduce(state, event)).toBe(state)
  })
})

describe('approvalPin', () => {
  it('usa o PIN do evento, depois o do estado, e só se for válido', () => {
    if (approve.screen !== 'approve' || approveWithPin.screen !== 'approve')
      throw new Error('estado de teste')
    expect(approvalPin(approve, { type: 'APPROVE', pin: '4821' })).toBe('4821')
    expect(approvalPin(approveWithPin, { type: 'APPROVE' })).toBe('4821')
    expect(approvalPin(approveWithPin, { type: 'APPROVE', pin: '1111' })).toBe('1111')
    expect(approvalPin(approve, { type: 'APPROVE' })).toBeNull()
    expect(approvalPin(approve, { type: 'APPROVE', pin: 'xx' })).toBeNull()
  })
})

describe('reduce: progresso da preparação', () => {
  const base = { screen: 'preparing', mode: 'send', step: 'engine' } as const

  it('guarda o texto e a fração do progresso', () => {
    const next = reduce(base, {
      type: 'PREP_PROGRESS',
      progress: { note: 'Baixando', fraction: 0.2 }
    })
    expect(next).toEqual({ ...base, progress: { note: 'Baixando', fraction: 0.2 } })
  })

  it('a barra nunca volta para trás', () => {
    const a = reduce(base, { type: 'PREP_PROGRESS', progress: { note: 'a', fraction: 0.5 } })
    const b = reduce(a, { type: 'PREP_PROGRESS', progress: { note: 'b', fraction: 0.3 } })
    expect(b).toMatchObject({ progress: { note: 'b', fraction: 0.5 } })
  })

  it('ao mudar de etapa o texto antigo sai, mas a fração continua', () => {
    const a = reduce(base, { type: 'PREP_PROGRESS', progress: { note: 'a', fraction: 0.5 } })
    expect(reduce(a, { type: 'PREP_STEP', step: 'display' })).toMatchObject({
      step: 'display',
      progress: { note: '', fraction: 0.5 }
    })
  })

  it('fora da preparação o progresso é ignorado', () => {
    const ready = { screen: 'ready', mode: 'send' } as const
    expect(reduce(ready, { type: 'PREP_PROGRESS', progress: { note: 'x', fraction: 1 } })).toBe(
      ready
    )
  })
})

describe('preparação do Começar', () => {
  const first = { screen: 'preparing', mode: 'send', step: 'engine', firstRun: true } as const

  it('ao terminar volta para a escolha, não para a espera', () => {
    expect(reduce(first, { type: 'PREP_DONE' })).toEqual({ screen: 'choose' })
  })

  it('as etapas não perdem a marca de primeira vez', () => {
    expect(reduce(first, { type: 'PREP_STEP', step: 'display' })).toMatchObject({
      step: 'display',
      firstRun: true
    })
  })
})
