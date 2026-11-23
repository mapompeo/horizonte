import { describe, expect, it } from 'vitest'
import type { AppState } from '../../shared/types'
import { createTrayFollower, wantsAttention } from './tray'

const ready: AppState = { screen: 'ready', mode: 'send' }
const connected: AppState = { screen: 'connected', mode: 'send', devices: [{ device: 'Notebook' }] }
const receiving: AppState = {
  screen: 'receiving',
  mode: 'receive',
  host: '192.168.1.7',
  name: 'Trabalho'
}

function harness(): { follow: (state: AppState) => void; log: string[] } {
  const log: string[] = []
  const follow = createTrayFollower(
    { hide: () => log.push('esconde'), show: () => log.push('mostra') },
    { open: () => log.push('icone'), close: () => log.push('sem-icone') }
  )
  return { follow, log }
}

describe('janela e ícones ocultos', () => {
  it('ao conectar some para os ícones ocultos e ao desconectar volta', () => {
    const { follow, log } = harness()
    follow(ready)
    follow(connected)
    follow(connected)
    follow(ready)
    expect(log).toEqual(['icone', 'esconde', 'mostra', 'sem-icone'])
  })

  it('recebendo a tela também vai para os ícones ocultos', () => {
    const { follow, log } = harness()
    follow(receiving)
    expect(log).toEqual(['icone', 'esconde'])
  })

  it('sem conexão a janela fica como está', () => {
    const { follow, log } = harness()
    follow(ready)
    follow({ screen: 'discover', mode: 'receive' })
    expect(log).toEqual([])
  })
})

describe('pedido que espera alguém no computador', () => {
  const approve = { screen: 'approve', mode: 'send', pairingId: 'p1', device: 'iPhone' } as AppState
  const mouse = {
    screen: 'mouse-request',
    mode: 'mouse',
    device: 'Notebook',
    address: '192.168.1.9'
  } as AppState
  it('traz a janela quando o Permitir ou o pedido do Mouse chega, uma vez só', () => {
    expect(wantsAttention('ready', approve)).toBe(true)
    expect(wantsAttention('approve', approve)).toBe(false)
    expect(wantsAttention('mouse', mouse)).toBe(true)
    expect(wantsAttention('approve', { screen: 'ready', mode: 'send' } as AppState)).toBe(false)
  })
})
