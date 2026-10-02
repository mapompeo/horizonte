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

describe('fluxo de envio', () => {
  it('instala, escolhe enviar, prepara, aprova e conecta', async () => {
    const { controller, engine } = await setup({ screen: 'install' })

    controller.dispatch({ type: 'INSTALL_DONE' })
    controller.dispatch({ type: 'CHOOSE', mode: 'send' })
    expect(screen(controller)).toBe('preparing')
    await vi.waitFor(() => expect(screen(controller)).toBe('ready'))

    engine.simulatePairRequest('Notebook')
    expect(controller.getSnapshot().state).toEqual({
      screen: 'approve',
      mode: 'send',
      device: 'Notebook'
    })

    controller.dispatch({ type: 'APPROVE' })
    expect(engine.calls).toContain('approve')
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
      device: 'Notebook'
    })
    controller.dispatch({ type: 'DENY' })
    expect(engine.calls).toContain('deny')
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

    controller.dispatch({ type: 'CONNECT', host: 'Desktop' })
    expect(controller.getSnapshot().state).toEqual({
      screen: 'receiving',
      mode: 'receive',
      host: 'Desktop'
    })
    expect(engine.calls).toContain('connect:Desktop')

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
    controller.dispatch({ type: 'CONNECT', host: 'Desktop' })
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
      device: 'Notebook'
    })
    controller.dispatch({ type: 'APPROVE' })
    controller.dispatch({ type: 'APPROVE' })
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
      host: 'Desktop'
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
