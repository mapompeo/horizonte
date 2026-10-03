import { describe, expect, it, vi } from 'vitest'
import { createController, type Controller } from './controller'
import { DEFAULT_SETTINGS, type SettingsStore } from './settings'
import { FakeEngine } from '../engine/fake'
import type { AppState, Settings } from '../../shared/types'

function memoryStore(): { store: SettingsStore; saved: Settings[] } {
  const saved: Settings[] = []
  const store: SettingsStore = {
    load: async () => ({ ...DEFAULT_SETTINGS }),
    save: async (settings) => {
      saved.push(settings)
    }
  }
  return { store, saved }
}

async function setup(
  initial: AppState,
  engine = new FakeEngine(0)
): Promise<{ controller: Controller; engine: FakeEngine; saved: Settings[] }> {
  const { store, saved } = memoryStore()
  const controller = await createController({ engine, store, initial })
  return { controller, engine, saved }
}

const screen = (controller: Controller): string => controller.getSnapshot().state.screen
const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('pedidos de pareamento em sequência', () => {
  const ready: AppState = { screen: 'ready', mode: 'send' }

  it('um segundo pedido durante a tela Permitir aparece depois que o primeiro é respondido', async () => {
    const { controller, engine } = await setup(ready)
    engine.simulatePairRequest('Notebook', 'p1')
    engine.simulatePairRequest('Tablet', 'p2')
    expect(controller.getSnapshot().state).toMatchObject({ screen: 'approve', pairingId: 'p1' })

    controller.dispatch({ type: 'DENY' })
    expect(controller.getSnapshot().state).toMatchObject({
      screen: 'approve',
      device: 'Tablet',
      pairingId: 'p2'
    })
  })

  it('um pedido que chega durante a conexão aparece quando ela termina', async () => {
    const { controller, engine } = await setup(ready)
    engine.simulateClientConnected('Notebook')
    engine.simulatePairRequest('Tablet', 'p2')
    expect(screen(controller)).toBe('connected')

    engine.simulateClientDisconnected()
    expect(controller.getSnapshot().state).toMatchObject({ screen: 'approve', pairingId: 'p2' })
  })

  it('o pedido cancelado enquanto esperava na fila não aparece', async () => {
    const { controller, engine } = await setup(ready)
    engine.simulatePairRequest('Notebook', 'p1')
    engine.simulatePairRequest('Tablet', 'p2')
    engine.simulatePairCancelled('p2')

    controller.dispatch({ type: 'DENY' })
    expect(screen(controller)).toBe('ready')
  })

  it('o mesmo pedido repetido não entra duas vezes na fila', async () => {
    const { controller, engine } = await setup(ready)
    engine.simulatePairRequest('Notebook', 'p1')
    engine.simulatePairRequest('Tablet', 'p2')
    engine.simulatePairRequest('Tablet', 'p2')
    engine.simulatePairRequest('Notebook', 'p1')

    controller.dispatch({ type: 'DENY' })
    controller.dispatch({ type: 'DENY' })
    expect(screen(controller)).toBe('ready')
  })
})

describe('fluxo de envio', () => {
  it('instala, escolhe enviar, prepara, aprova e conecta', async () => {
    const { controller, engine } = await setup({ screen: 'install' })

    controller.dispatch({ type: 'INSTALL_DONE' })
    expect(screen(controller)).toBe('preparing') // Começar já prepara o motor
    await vi.waitFor(() => expect(screen(controller)).toBe('choose'))
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(screen(controller)).toBe('preparing')
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))

    engine.simulatePairRequest('Notebook')
    expect(controller.getSnapshot().state).toEqual({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })

    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    expect(engine.lastApprove).toEqual({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
    expect(screen(controller)).toBe('ready')

    engine.simulateClientConnected('Notebook')
    expect(screen(controller)).toBe('connected')

    controller.dispatch({ type: 'STOP' })
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).toContain('stopSending')
  })

  it('recusar avisa o motor', async () => {
    const { controller, engine } = await setup({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })
    controller.dispatch({ type: 'DENY' })
    expect(engine.calls).toContain('deny')
    expect(engine.lastDeny).toBe('p1')
    expect(screen(controller)).toBe('ready')
  })

  it('cliente que desconecta volta para pronto sem parar o motor de novo', async () => {
    const { controller, engine } = await setup({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
    engine.simulateClientDisconnected()
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).not.toContain('stopSending')
  })
})

describe('fluxo de recebimento', () => {
  it('escolhe mostrar, conecta e sai', async () => {
    const { controller, engine } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    expect(screen(controller)).toBe('discover')

    controller.dispatch({ type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' })
    expect(controller.getSnapshot().state).toEqual({
      screen: 'receiving',
      mode: 'receive',
      host: '192.168.1.3',
      name: 'Desktop'
    })
    expect(engine.calls).toContain('connect:192.168.1.3')

    controller.dispatch({ type: 'STOP' })
    expect(screen(controller)).toBe('discover')
    expect(engine.calls).toContain('disconnect')
  })

  it('lista os computadores da rede', async () => {
    const { controller } = await setup({ screen: 'discover', mode: 'receive' })
    expect(await controller.listHosts()).toEqual([{ name: 'Desktop', address: '192.168.1.3' }])
  })

  it('falha ao conectar mostra erro com o detalhe', async () => {
    const engine = new FakeEngine(0)
    engine.failConnect = 'sem rede'
    const { controller } = await setup({ screen: 'discover', mode: 'receive' }, engine)
    controller.dispatch({ type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))
    const state = controller.getSnapshot().state
    expect(state.screen === 'error' && state.error.detail).toBe('sem rede')
  })
})

describe('erros', () => {
  it('falha ao preparar mostra erro e tentar de novo funciona', async () => {
    const engine = new FakeEngine(0)
    engine.failPrepare = 'sem permissão'
    const { controller } = await setup({ screen: 'choose' }, engine)

    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))

    controller.dispatch({ type: 'RETRY' })
    expect(screen(controller)).toBe('preparing')
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))
  })
})

describe('eventos no estado errado', () => {
  it('aprovar duas vezes avisa o motor uma vez só', async () => {
    const { controller, engine } = await setup({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })
    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    expect(engine.calls.filter((call) => call === 'approve')).toHaveLength(1)
  })

  it('pedido de pareamento durante uma conexão é ignorado', async () => {
    const { controller, engine } = await setup({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
    engine.simulatePairRequest('Intruso')
    expect(controller.getSnapshot().state).toEqual({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
  })

  it('eventos do modo enviar no modo mostrar são ignorados', async () => {
    const { controller, engine } = await setup({ screen: 'discover', mode: 'receive' })
    engine.simulateClientConnected('Notebook')
    engine.simulatePairRequest('Notebook')
    expect(screen(controller)).toBe('discover')
  })
})

describe('troca de modo', () => {
  it('sair de conectado para mostrar para o envio', async () => {
    const { controller, engine } = await setup({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    expect(screen(controller)).toBe('discover')
    expect(engine.calls).toContain('stopSending')
  })

  it('sair de recebendo para enviar encerra a conexão', async () => {
    const { controller, engine } = await setup({
      screen: 'receiving',
      mode: 'receive',
      host: '192.168.1.3',
      name: 'Desktop'
    })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(screen(controller)).toBe('preparing')
    expect(engine.calls).toContain('disconnect')
  })

  it('enviar, mostrar, enviar termina pronto e sem erro', async () => {
    const { controller, engine } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))
    await settle()
    expect(screen(controller)).toBe('ready')
    expect(engine.calls.filter((call) => call === 'prepare')).toHaveLength(2)
  })

  it('a falha de uma preparação abandonada não mostra erro', async () => {
    const engine = new FakeEngine(0)
    engine.failPrepare = 'tarde demais'
    const { controller } = await setup({ screen: 'choose' }, engine)
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    await settle()
    expect(controller.getSnapshot().state).toEqual({ screen: 'discover', mode: 'receive' })
  })

  it('o fim de uma preparação abandonada não tira o usuário da tela atual', async () => {
    const { controller } = await setup({ screen: 'choose' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    await settle()
    expect(screen(controller)).toBe('discover')
  })
})

describe('falhas tardias e de limpeza', () => {
  it('a falha tardia de uma conexão abandonada não aparece sobre a conexão nova', async () => {
    const engine = new FakeEngine(30)
    engine.failConnect = 'sem rede'
    const { controller } = await setup({ screen: 'discover', mode: 'receive' }, engine)
    controller.dispatch({ type: 'CONNECT', host: '10.0.0.1', name: 'A' })
    controller.dispatch({ type: 'STOP' })
    controller.dispatch({ type: 'CONNECT', host: '10.0.0.2', name: 'B' })
    await settle(150)
    expect(controller.getSnapshot().state).toEqual({
      screen: 'receiving',
      mode: 'receive',
      host: '10.0.0.2',
      name: 'B'
    })
  })

  it('a falha tardia de aprovar não derruba uma conexão já estabelecida', async () => {
    const engine = new FakeEngine(30)
    engine.failApprove = 'demorou'
    const { controller } = await setup(
      { screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null },
      engine
    )
    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    engine.simulateClientConnected('Notebook')
    await settle(150)
    expect(controller.getSnapshot().state).toEqual({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
  })

  it('a falha de aprovar, com o usuário ainda na tela, mostra erro', async () => {
    const engine = new FakeEngine(0)
    engine.failApprove = 'recusado pelo motor'
    const { controller } = await setup(
      { screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null },
      engine
    )
    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))
    const state = controller.getSnapshot().state
    expect(state.screen === 'error' && state.error.detail).toBe('recusado pelo motor')
  })

  it('se desconectar também falhar, o erro original continua na tela', async () => {
    const engine = new FakeEngine(0)
    engine.failConnect = 'sem rede'
    engine.failDisconnect = 'já tinha caído'
    const { controller } = await setup({ screen: 'discover', mode: 'receive' }, engine)
    controller.dispatch({ type: 'CONNECT', host: '192.168.1.3', name: 'Desktop' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))
    await settle()
    const state = controller.getSnapshot().state
    expect(state.screen === 'error' && state.error.message).toBe(
      'Não consegui conectar a esse computador.'
    )
    expect(state.screen === 'error' && state.error.detail).toBe('sem rede')
  })

  it('falha ao encerrar a conexão, com o usuário na mesma tela, mostra erro', async () => {
    const engine = new FakeEngine(0)
    engine.failDisconnect = 'travou'
    const { controller } = await setup(
      { screen: 'receiving', mode: 'receive', host: '192.168.1.3', name: 'Desktop' },
      engine
    )
    controller.dispatch({ type: 'STOP' })
    await vi.waitFor(() => expect(screen(controller)).toBe('error'))
  })
})

describe('motor avisado ao abandonar o modo enviar', () => {
  const idle: [string, AppState][] = [
    ['preparando', { screen: 'preparing', mode: 'send', step: 'engine' }],
    ['pronto', { screen: 'ready', mode: 'send' }],
    [
      'permitir',
      { screen: 'approve', mode: 'send', device: 'Notebook', pairingId: 'p1', pin: null }
    ]
  ]

  it.each(idle)('sair de %s para mostrar chama abort', async (_name, initial) => {
    const { controller, engine } = await setup(initial)
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    expect(engine.calls).toContain('abort')
  })

  it('um erro no meio do envio também avisa o motor', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    controller.dispatch({ type: 'FAIL', error: { message: 'x' } })
    expect(engine.calls).toContain('abort')
  })

  it('avançar dentro do modo enviar não chama abort', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    engine.simulatePairRequest('Notebook')
    controller.dispatch({ type: 'APPROVE', pin: '4821' })
    engine.simulateClientConnected('Notebook')
    expect(screen(controller)).toBe('connected')
    expect(engine.calls).not.toContain('abort')
  })
})

describe('pareamento com PIN', () => {
  it('aprovar sem PIN não chama o motor e não sai da tela', async () => {
    const { controller, engine } = await setup({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: null
    })
    controller.dispatch({ type: 'APPROVE' })
    controller.dispatch({ type: 'APPROVE', pin: '12' })
    expect(screen(controller)).toBe('approve')
    expect(engine.calls).not.toContain('approve')
  })

  it('com o PIN já conhecido aprova sem digitar', async () => {
    const { controller, engine } = await setup({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook',
      pairingId: 'p1',
      pin: '4821'
    })
    controller.dispatch({ type: 'APPROVE' })
    expect(engine.lastApprove).toEqual({ pairingId: 'p1', pin: '4821', name: 'Notebook' })
  })

  it('o cancelamento do pedido volta para pronto sem chamar o motor', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    engine.simulatePairRequest('Notebook', 'p9')
    expect(screen(controller)).toBe('approve')
    engine.simulatePairCancelled('p9')
    expect(screen(controller)).toBe('ready')
    expect(engine.calls).not.toContain('deny')
    expect(engine.calls).not.toContain('approve')
  })

  it('o cancelamento de outro pedido é ignorado', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    engine.simulatePairRequest('Notebook', 'p9')
    engine.simulatePairCancelled('outro')
    expect(screen(controller)).toBe('approve')
  })
})

describe('ajustes e assinantes', () => {
  it('atualizar o bitrate valida, persiste e avisa os assinantes', async () => {
    const { controller, saved } = await setup({ screen: 'ready', mode: 'send' })
    const seen: number[] = []
    controller.subscribe((snapshot) => seen.push(snapshot.settings.bitrate))

    const next = await controller.updateSettings({ bitrate: 33.4 })
    expect(next.bitrate).toBe(33)
    expect(next.profile).toBe('custom')
    expect(saved[saved.length - 1]?.bitrate).toBe(33)
    expect(seen).toEqual([33])
  })

  it('o perfil não pode ser forçado pelo patch', async () => {
    const { controller } = await setup({ screen: 'ready', mode: 'send' })
    const next = await controller.updateSettings({ profile: 'maximo', bitrate: 10 } as never)
    expect(next.profile).toBe('economico')
  })

  it('aplica o bitrate ao vivo quando há conexão', async () => {
    const { controller, engine } = await setup({
      screen: 'connected',
      mode: 'send',
      device: 'Notebook'
    })
    await controller.updateSettings({ bitrate: 50 })
    expect(engine.calls).toContain('bitrate:50')
  })

  it('não mexe no motor quando não há conexão', async () => {
    const { controller, engine } = await setup({ screen: 'ready', mode: 'send' })
    await controller.updateSettings({ bitrate: 50 })
    expect(engine.calls.some((call) => call.startsWith('bitrate:'))).toBe(false)
  })

  it('quem cancela a assinatura deixa de receber', async () => {
    const { controller } = await setup({ screen: 'ready', mode: 'send' })
    let count = 0
    const stop = controller.subscribe(() => count++)
    controller.dispatch({ type: 'CHOOSE', mode: 'receive' })
    stop()
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(count).toBe(1)
  })
})
