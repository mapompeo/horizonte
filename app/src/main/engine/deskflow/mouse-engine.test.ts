import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../shared/types'
import { createMouseEngine, type MouseChannel } from './mouse-engine'
import type { MouseShare } from './session'
import type { MousePlacement } from '../port'

/** Um computador só, encostado do lado `side`. */
const one = (
  name: string,
  address: string,
  side: MousePlacement['side'] = 'right',
  offset?: number
): MousePlacement[] => [{ host: { name, address }, side, offset }]

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
    share: async ({ links }) =>
      void calls.push(
        'share:' +
          links.map(({ name, side }) => (side === 'right' ? name : `${name}:${side}`)).join(',')
      ),
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
    await desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
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
    await linux.engine.start('Trabalho')
    await desktop.engine.share(one('192.168.1.7', '192.168.1.7', 'right'), 'Desktop')
    await linux.engine.accept('Trabalho')
    expect(desktop.share.calls).toEqual(['share:192.168.1.7'])
    expect(linux.share.calls).toEqual(['follow:192.168.1.4:192.168.1.7'])
  })

  it('recusar avisa quem pediu, que desliga o servidor', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
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
    await desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
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
    await desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
    await notebook.engine.accept('Notebook')
    await net.channel('192.168.1.66').send('192.168.1.6', '/mouse/end', {})
    expect(notebook.ended).not.toHaveBeenCalled()
  })

  it('outro PC sem o Horizonte no modo Mouse: desliga o servidor e explica', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    await desktop.engine.start('Desktop')
    await expect(
      desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
    ).rejects.toThrow(/modo Mouse/)
    expect(desktop.share.calls).toEqual(['share:Notebook', 'stop'])
  })

  it('o Deskflow caindo sozinho avisa o outro PC', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await notebook.engine.start('Notebook')
    await desktop.engine.share(one('Notebook', '192.168.1.6', 'right'), 'Desktop')
    await notebook.engine.accept('Notebook')
    desktop.share.endItself()
    await new Promise((resolve) => setTimeout(resolve, 10))
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
    await linux.engine.start('Trabalho')
    await desktop.engine.setLayout(one('Trabalho', '192.168.1.7', 'left'))
    expect(desktop.share.calls).toEqual([])
    await desktop.engine.share(one('Trabalho', '192.168.1.7', 'left'), 'Desktop')
    await desktop.engine.setLayout(one('Trabalho', '192.168.1.7', 'above'))
    expect(desktop.share.calls).toEqual(['share:Trabalho:left', 'share:Trabalho:above'])
  })

  it('com os tamanhos das telas, manda ao Deskflow só o trecho da borda onde o outro encosta', async () => {
    const net = network()
    const ranges: unknown[] = []
    const engine = createMouseEngine({
      share: {
        ...fakeShare(),
        share: async (options) => void ranges.push(options.links[0]?.ranges)
      },
      channel: net.channel('192.168.1.4'),
      advertise: () => () => undefined,
      browse: async () => [
        { name: 'Trabalho', address: '192.168.1.7', screen: { width: 1366, height: 768 } }
      ],
      ownScreen: () => ({ width: 3840, height: 1080 })
    })
    await pc(net, '192.168.1.7').engine.start('Trabalho')
    await engine.start('Desktop')
    const [trabalho] = await engine.listPeers()
    await engine.share(one('Trabalho', '192.168.1.7', 'right', 0.7), 'Desktop')
    await engine.setLayout(one('Trabalho', '192.168.1.7', 'left'))
    expect(trabalho?.screen).toEqual({ width: 1366, height: 768 })
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
    await linux.engine.start('Trabalho')
    await intruso.engine.start('Intruso')
    await desktop.engine.share(one('Trabalho', '192.168.1.7', 'left'), 'Desktop')
    await linux.engine.accept('Trabalho')
    linux.text.copy('copiado no linux')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktop.text.written).toEqual(['copiado no linux'])

    await net.channel('192.168.1.66').send('192.168.1.4', '/mouse/text', { text: 'invasão' })
    expect(desktop.text.written).toEqual(['copiado no linux'])

    await desktop.engine.end()
    expect(desktop.text.watching()).toBe(false)
  })

  it('vários computadores de uma vez: um servidor só, um pedido para cada; o texto vai para todos', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Trabalho')
    await notebook.engine.start('Notebook')
    await desktop.engine.share(
      [
        { host: { name: 'Trabalho', address: '192.168.1.7' }, side: 'left' },
        { host: { name: 'Notebook', address: '192.168.1.6' }, side: 'below' }
      ],
      'Desktop'
    )
    expect(desktop.share.calls).toEqual(['share:Trabalho:left,Notebook:below'])
    expect(linux.requests).toHaveLength(1)
    expect(notebook.requests).toHaveLength(1)
    await linux.engine.accept('Trabalho')
    await notebook.engine.accept('Notebook')
    desktop.text.copy('copiado no desktop')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(linux.text.written).toEqual(['copiado no desktop'])
    expect(notebook.text.written).toEqual(['copiado no desktop'])
  })

  it('um recusa: o servidor segue com o outro; o último saindo encerra', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    const notebook = pc(net, '192.168.1.6')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Trabalho')
    await notebook.engine.start('Notebook')
    await desktop.engine.share(
      [
        { host: { name: 'Trabalho', address: '192.168.1.7' }, side: 'left' },
        { host: { name: 'Notebook', address: '192.168.1.6' }, side: 'right' }
      ],
      'Desktop'
    )
    await notebook.engine.deny()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktop.share.calls).toEqual(['share:Trabalho:left,Notebook', 'share:Trabalho:left'])
    expect(desktop.ended).not.toHaveBeenCalled()
    await linux.engine.deny()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktop.share.calls).toContain('stop')
    expect(desktop.ended).toHaveBeenCalledOnce()
  })

  it('um não responde: fica de fora e os outros seguem', async () => {
    const net = network()
    const desktop = pc(net, '192.168.1.4')
    const linux = pc(net, '192.168.1.7')
    await desktop.engine.start('Desktop')
    await linux.engine.start('Trabalho')
    await desktop.engine.share(
      [
        { host: { name: 'Trabalho', address: '192.168.1.7' }, side: 'left' },
        { host: { name: 'Desligado', address: '192.168.1.99' }, side: 'right' }
      ],
      'Desktop'
    )
    expect(desktop.share.calls).toEqual(['share:Trabalho:left,Desligado', 'share:Trabalho:left'])
    expect(desktop.ended).not.toHaveBeenCalled()
  })
})
