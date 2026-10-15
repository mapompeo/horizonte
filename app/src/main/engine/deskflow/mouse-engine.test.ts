import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../shared/types'
import { createMouseEngine, type MouseChannel } from './mouse-engine'
import type { MouseShare } from './session'

/** Rede de mentira: cada endereço tem um canal, e o send entrega na hora para o outro lado. */
function network(): { channel(address: string): MouseChannel } {
  const handlers = new Map<string, (path: string, body: unknown, from: string) => boolean>()
  return {
    channel: (address) => ({
      listen: async (onMessage) => void handlers.set(address, onMessage),
      close: async () => void handlers.delete(address),
      send: async (to, path, body) => {
        const handler = handlers.get(to)
        if (!handler) throw new Error('ninguém escutando')
        handler(path, body, `::ffff:${address}`)
      }
    })
  }
}

function fakeShare(): MouseShare & {
  calls: string[]
  endItself(): void
} {
  const ended = new Set<() => void>()
  const calls: string[] = []
  return {
    calls,
    share: async ({ peerName, side }) =>
      void calls.push(side === 'right' ? `share:${peerName}` : `share:${peerName}:${side}`),
    follow: async ({ name, serverAddress }) => void calls.push(`follow:${serverAddress}:${name}`),
    stop: () => void calls.push('stop'),
    onEnded: (listener) => {
      ended.add(listener)
      return () => ended.delete(listener)
    },
    endItself: () => ended.forEach((listener) => listener())
  }
}

function pc(
  net: ReturnType<typeof network>,
  address: string,
  peers: Host[] = []
): {
  engine: ReturnType<typeof createMouseEngine>
  share: ReturnType<typeof fakeShare>
  requests: { device: string; address: string }[]
  ended: ReturnType<typeof vi.fn>
} {
  const share = fakeShare()
  const engine = createMouseEngine({
    share,
    channel: net.channel(address),
    advertise: () => () => undefined,
    browse: async () => peers
  })
  const requests: { device: string; address: string }[] = []
  const ended = vi.fn()
  engine.onRequest((request) => requests.push(request))
  engine.onEnded(ended)
  return { engine, share, requests, ended }
}

describe('modo Mouse entre dois PCs', () => {
  it('Desktop empresta o mouse: sobe o servidor e o Notebook recebe o pedido com o endereço certo', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    expect(desktop.share.calls).toEqual(['share:Notebook'])
    expect(notebook.requests).toEqual([{ device: 'Desktop', address: '192.168.1.4' }])

    await notebook.engine.accept('Notebook')
    expect(notebook.share.calls).toEqual(['follow:192.168.1.4:Notebook'])
  })

  it('adicionado pelo IP: o outro entra com o nome que o servidor conhece, senão o Deskflow recusa', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Suntrans')
    await desktop.engine.share({ name: '192.168.1.7', address: '192.168.1.7' }, 'Desktop', 'right')
    await linux.engine.accept('Suntrans')
    expect(desktop.share.calls).toEqual(['share:192.168.1.7'])
    expect(linux.share.calls).toEqual(['follow:192.168.1.4:192.168.1.7'])
  })

  it('recusar avisa quem pediu, que desliga o servidor', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    await notebook.engine.deny()
    expect(desktop.share.calls).toContain('stop')
    expect(desktop.ended).toHaveBeenCalledOnce()
  })

  it('parar de um lado encerra o outro também', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    await notebook.engine.accept('Notebook')
    await desktop.engine.end()
    expect(notebook.share.calls).toContain('stop')
    expect(notebook.ended).toHaveBeenCalledOnce()
    expect(desktop.ended).not.toHaveBeenCalled()
  })

  it('um terceiro na rede não consegue encerrar a conexão dos dois', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    const intruso = pc(net, '192.168.1.66')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await intruso.engine.start('Intruso')
    await desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    await notebook.engine.accept('Notebook')
    await net.channel('192.168.1.66').send('192.168.1.6', '/mouse/end', {})
    expect(notebook.ended).not.toHaveBeenCalled()
  })

  it('outro PC sem o Horizonte no modo Mouse: desliga o servidor e explica', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    await desktop.engine.start('Desktop')
    await expect(
      desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    ).rejects.toThrow(/modo Mouse/)
    expect(desktop.share.calls).toEqual(['share:Notebook', 'stop'])
  })

  it('o Deskflow caindo sozinho avisa o outro PC', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share({ name: 'Notebook', address: '192.168.1.6' }, 'Desktop', 'right')
    await notebook.engine.accept('Notebook')
    desktop.share.endItself()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktop.ended).toHaveBeenCalledOnce()
    expect(notebook.ended).toHaveBeenCalledOnce()
  })

  it('pedido sem nome é recusado pelo canal', async () => {
    const net = network()
    const notebook = pc(net, '192.168.1.6')
    await notebook.engine.start('Notebook')
    await net.channel('192.168.1.4').send('192.168.1.6', '/mouse/request', { device: '' })
    expect(notebook.requests).toEqual([])
  })

  it('trocar o lado refaz o servidor com o lado novo; sem compartilhar, não faz nada', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Suntrans')
    await desktop.engine.setSide('left')
    expect(desktop.share.calls).toEqual([])
    await desktop.engine.share({ name: 'Suntrans', address: '192.168.1.7' }, 'Desktop', 'left')
    await desktop.engine.setSide('above')
    expect(desktop.share.calls).toEqual(['share:Suntrans:left', 'share:Suntrans:above'])
  })
})
