import { describe, expect, it } from 'vitest'
import type { AppState } from '../../shared/types'
import { createTrayFollower } from './tray'

const ready: AppState = { screen: 'ready', mode: 'send' }
const connected: AppState = { screen: 'connected', mode: 'send', device: 'Notebook' }
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
