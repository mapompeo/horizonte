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
  text: { written: string[]; copy(text: string): void; watching(): boolean }
} {
  const share = fakeShare()
  let onCopied: ((text: string) => void) | null = null
  const written: string[] = []
  const text = {
    written,
    copy: (value: string) => onCopied?.(value),
    watching: () => onCopied !== null
  }
  const engine = createMouseEngine({
    share,
    channel: net.channel(address),
    advertise: () => () => undefined,
    browse: async () => peers,
    text: {
      start: (listener) => void (onCopied = listener),
      stop: () => void (onCopied = null),
      write: (value) => void written.push(value)
    }
  })
  const requests: { device: string; address: string }[] = []
  const ended = vi.fn()
  engine.onRequest((request) => requests.push(request))
  engine.onEnded(ended)
  return { engine, share, requests, ended, text }
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
    await desktop.engine.setLayout('left')
    expect(desktop.share.calls).toEqual([])
    await desktop.engine.share({ name: 'Suntrans', address: '192.168.1.7' }, 'Desktop', 'left')
    await desktop.engine.setLayout('above')
    expect(desktop.share.calls).toEqual(['share:Suntrans:left', 'share:Suntrans:above'])
  })

  it('com os tamanhos das telas, manda ao Deskflow só o trecho da borda onde o outro encosta', async () => {
    const net = network()
    const ranges: unknown[] = []
    const engine = createMouseEngine({
      share: { ...fakeShare(), share: async (options) => void ranges.push(options.ranges) },
      channel: net.channel('192.168.1.4'),
      advertise: () => () => undefined,
      browse: async () => [
        { name: 'Suntrans', address: '192.168.1.7', screen: { width: 1366, height: 768 } }
      ],
      ownScreen: () => ({ width: 3840, height: 1080 })
    })
    await pc(net, '192.168.1.7').engine.start('Suntrans')
    await engine.start('Desktop')
    const [suntrans] = await engine.listPeers()
    await engine.share({ name: 'Suntrans', address: '192.168.1.7' }, 'Desktop', 'right', 0.7)
    await engine.setLayout('left')
    expect(suntrans?.screen).toEqual({ width: 1366, height: 768 })
    expect(ranges).toEqual([
      { own: [70, 100], peer: [0, 42] },
      { own: [14, 86], peer: [0, 100] }
    ])
  })

  it('texto copiado no Linux vai para o outro lado; um terceiro na rede não escreve nada', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    const intruso = pc(net, '192.168.1.66')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Suntrans')
    await intruso.engine.start('Intruso')
    await desktop.engine.share({ name: 'Suntrans', address: '192.168.1.7' }, 'Desktop', 'left')
    await linux.engine.accept('Suntrans')
    linux.text.copy('copiado no linux')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktop.text.written).toEqual(['copiado no linux'])

    await net.channel('192.168.1.66').send('192.168.1.4', '/mouse/text', { text: 'invasão' })
    expect(desktop.text.written).toEqual(['copiado no linux'])

    await desktop.engine.end()
    expect(desktop.text.watching()).toBe(false)
  })
})
